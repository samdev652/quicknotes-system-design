# QuickNotes Architecture

## 1. Requirements

### Functional requirements

- Users can register and log in.
- Users can create, view, edit and delete their own notes.
- Users can add tags to notes and find notes by tag or keyword.
- Notes are validated (title required, maximum 100 characters).
- The service is available from browsers and phones through a REST API.

### Non-functional requirements

- **Scale:** support 1 million registered users.
- **Availability:** no single point of failure, target 99.9% uptime.
- **Performance:** listing notes responds in under 300 ms for most requests.
- **Durability:** a saved note is never lost, with backups and replication.
- **Security:** passwords are hashed, traffic uses HTTPS, and users can only access their own notes.
- **Scalability:** capacity can grow by adding servers instead of rewriting the system.

## 2. Load estimate for 1 million users

### Assumptions

- 1,000,000 registered users, 20% active each day, so **200,000 daily active users**
- Each active user loads their notes list 20 times a day (reads)
- Each active user creates, edits or deletes 5 notes a day (writes)
- An average note takes about 2 KB including indexes and overhead
- Peak traffic is 5 times the average, and a day has 86,400 seconds

### Reads per second

- Reads per day: 200,000 x 20 = 4,000,000
- Average: 4,000,000 / 86,400 = about **46 reads/s**
- Peak: about **230 reads/s**

### Writes per second

- Writes per day: 200,000 x 5 = 1,000,000
- Average: 1,000,000 / 86,400 = about **12 writes/s**
- Peak: about **60 writes/s**

### Storage per year

- New notes per day: about 1,000,000 (counting every write as a new note, which is the worst case)
- Per day: 1,000,000 x 2 KB = 2 GB
- Per year: 2 GB x 365 = about **730 GB** (roughly 0.73 TB)

| Measure           | Average | Peak           |
| ----------------- | ------- | -------------- |
| Reads per second  | 46      | 230            |
| Writes per second | 12      | 60             |
| Storage per year  | 730 GB  | not applicable |

The system is **read-heavy** (about 4 reads for every write). These numbers are small enough for one primary database, which is why the design focuses on availability and caching rather than on sharding.

## 3. Architecture diagram

```
                         Client (browser / mobile app)
                                     |
                                     v
                           +------------------+
                           |       DNS        |  api.quicknotes.example -> addresses
                           +---------+--------+
                                     |
                  +------------------+-------------------+
                  |                                      |
          static files (HTML/CSS/JS)                API calls (/v1/...)
                  |                                      |
                  v                                      v
          +---------------+                    +------------------+
          |      CDN      |                    |  Load balancer   |
          +---------------+                    +--------+---------+
                                                        |
                                    +-------------------+-------------------+
                                    |                                       |
                                    v                                       v
                             +-------------+                         +-------------+
                             | App server 1|                         | App server 2|   (more can be added)
                             +------+------+                         +------+------+
                                    \                                       /
                                     \                                     /
                  +------------------+-------------------+----------------+
                  |                                      |                |
                  v                                      v                v
            +-----------+                   +----------------------+  +---------+
            |   Cache   |                   |   Primary database   |  |  Queue  |
            |  (Redis)  |                   |   (all writes)       |  +----+----+
            +-----------+                   +-----------+----------+       |
                                                        | replication      v
                                                        v             +---------+
                                            +----------------------+  | Worker  |
                                            |    Read replica      |  +----+----+
                                            |   (list/search reads)|       |
                                            +----------------------+       |
                                                        ^                  |
                                                        +------------------+
                                                       worker writes results
                                                       (e.g. search index, emails)
```

## 4. What each component does

- **Client:** the browser or phone app that shows notes and sends API requests, so users never touch the database directly.
- **DNS:** translates the friendly name `api.quicknotes.example` into the address of the load balancer, so we can move or add servers without changing what users type.
- **CDN:** serves the static front-end files from servers near the user, which makes the app load faster and keeps that traffic off our app servers.
- **Load balancer:** spreads API requests across the app servers and stops sending requests to a server that has failed, so one crashed server does not take the service down.
- **App servers:** run the API logic (login checks, validation, reading and writing notes) and keep no user data locally, so we can add more of them as traffic grows.
- **Cache:** keeps recently read notes lists in memory so repeated requests are answered in milliseconds without touching the database.
- **Primary database:** stores users, notes and tags reliably and handles every write, so data stays consistent in one place.
- **Read replica:** holds a live copy of the primary and serves read queries, so reads do not slow down writes and a copy of the data exists if the primary fails.
- **Queue:** holds background jobs such as "update the search index" or "send a welcome email", so a request can finish without waiting for slow work.
- **Worker:** takes jobs from the queue and performs them, so slow tasks run in the background and can be retried if they fail.

## 5. Request flows

### GET /notes

1. The client asks DNS for `api.quicknotes.example` and sends `GET /v1/notes?page=1` with its token.
2. The load balancer picks a healthy app server.
3. The app server checks the token. If it is missing or expired it returns 401.
4. The app server looks for the key `notes:user:{id}:page:1` in the cache.
5. **Cache hit:** it returns the cached list immediately with 200.
6. **Cache miss:** it runs the "newest notes" query on the **read replica**, stores the result in the cache with a 60-second lifetime, and returns it with 200.

### POST /notes

1. The client sends `POST /v1/notes` with a JSON body and its token. DNS and the load balancer route it to an app server.
2. The app server checks the token (401 if invalid) and validates the body. A missing title or a title over 100 characters returns 400.
3. The app server inserts the note, and its tag links, in one transaction on the **primary database**.
4. It deletes that user's cached notes lists, so the next read is fresh.
5. It puts a job such as "update search index" on the **queue**.
6. It returns 201 Created with the new note, without waiting for the job.
7. A **worker** takes the job from the queue and completes it, retrying if it fails.

## 6. Trade-offs

- **Caching: speed against freshness.** A cached list can be up to 60 seconds old, so another device might not see a new note immediately. We reduce this by deleting the user's cache entries on every write, but a short delay can still happen. We accept it because notes do not need split-second consistency.
- **Read replica: scale against consistency.** The replica can lag slightly behind the primary, so a user might create a note and not see it in the next list request. We can read a user's own recent data from the primary to avoid this, at the cost of extra primary load.
- **Queue and worker: fast responses against eventual completion.** Users get a quick 201 reply, but background results such as search indexing appear a little later, and we must run and monitor extra components.
- **SQL with one primary: strong consistency against write scaling.** All writes go to a single primary, which keeps data correct and simple. This is enough for about 60 writes per second at peak, but if writes grew enormously we would need sharding, which is much harder to do.

## 7. Avoiding single points of failure

- **DNS and CDN:** use a managed provider with many servers worldwide, and a second DNS provider as backup.
- **Load balancer:** run at least two (or a managed load balancer spread over several zones) with health checks.
- **App servers:** run two or more in different availability zones. The load balancer removes failed ones automatically.
- **Cache:** use a replicated cache cluster. If it fails, requests fall back to the database, which is slower but still works.
- **Database:** the primary has a read replica in another zone. If the primary fails, the replica is promoted automatically and the app servers reconnect. Regular backups protect against data corruption or accidental deletion.
- **Queue and workers:** use a replicated queue and run several workers. Unfinished jobs return to the queue and are retried.
