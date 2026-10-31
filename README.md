# QuickNotes System Design

QuickNotes is moving from a browser-only app to an online service for 1 million users. This repository has two parts: a small API client that proves the front end can talk to a REST API using fetch (it uses the JSONPlaceholder practice API), and the design documents that the backend team will build the real service from.

## The API client

- Load 10 notes from the server (GET)
- Create a note with validation: title required, up to 100 characters (POST)
- Delete a note (DELETE)
- Loading, success, error and empty states shown on the page
- Buttons are disabled while a request is running
- All user text is inserted with `textContent`

Note: JSONPlaceholder does not really store anything. Created notes get the id 101 but are not saved, so notes created during a visit are removed locally, and loaded notes are removed with a real DELETE request.

## How to run the API client

1. Clone the repository:
   `git clone https://github.com/YOUR-USERNAME/quicknotes-system-design.git`
2. Open the folder in VS Code.
3. Right-click `index.html` and choose **Open with Live Server**, or open `index.html` in a browser. An internet connection is needed.
4. Click **Load notes**, add a note with the form, and try the Delete buttons.

## Design documents

- [API design](docs/api-design.md): REST endpoints, JSON examples and error codes
- [Data model](docs/data-model.md): tables, relationships, SQL, indexes and the SQL choice
- [Architecture](docs/architecture.md): requirements, load estimates, diagram, request flows and trade-offs

## What I learned

- A reusable `request()` function that checks `response.ok` means every call handles errors in the same way, because `fetch` only fails by itself on network problems and not on 404 or 500 responses.
- Showing loading, success, error and empty states, and disabling buttons during requests, makes an app feel reliable and stops users sending the same request twice.
- A many-to-many relationship such as notes and tags needs a join table (`note_tags`) with a composite primary key.
- Load estimates (reads per second, writes per second and storage per year) show which components are really needed, and caching, replicas and queues each solve a specific problem.
- Every design choice is a trade-off, for example a cache is fast but can be stale, and a read replica scales reads but can lag.
