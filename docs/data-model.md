# QuickNotes Data Model

The database is a relational database (PostgreSQL syntax is used below).

## Entities

### users

| Column        | Type         | Key / rules           |
| ------------- | ------------ | --------------------- |
| user_id       | BIGINT       | Primary key           |
| email         | VARCHAR(255) | NOT NULL, UNIQUE      |
| password_hash | VARCHAR(255) | NOT NULL              |
| display_name  | VARCHAR(100) | NOT NULL              |
| created_at    | TIMESTAMPTZ  | NOT NULL, default now |

### notes

| Column     | Type         | Key / rules                             |
| ---------- | ------------ | --------------------------------------- |
| note_id    | BIGINT       | Primary key                             |
| user_id    | BIGINT       | Foreign key to users(user_id), NOT NULL |
| title      | VARCHAR(100) | NOT NULL                                |
| body       | TEXT         | NOT NULL, default empty                 |
| created_at | TIMESTAMPTZ  | NOT NULL, default now                   |
| updated_at | TIMESTAMPTZ  | NOT NULL, default now                   |

### tags

| Column  | Type        | Key / rules                             |
| ------- | ----------- | --------------------------------------- |
| tag_id  | BIGINT      | Primary key                             |
| user_id | BIGINT      | Foreign key to users(user_id), NOT NULL |
| name    | VARCHAR(50) | NOT NULL, UNIQUE together with user_id  |

### note_tags

| Column  | Type   | Key / rules                                            |
| ------- | ------ | ------------------------------------------------------ |
| note_id | BIGINT | Foreign key to notes(note_id), part of the primary key |
| tag_id  | BIGINT | Foreign key to tags(tag_id), part of the primary key   |

The primary key is the pair (note_id, tag_id).

## Relationships

- **users to notes: one-to-many.** One user writes many notes, and each note belongs to exactly one user.
- **users to tags: one-to-many.** Each user has their own set of tags, so two users can both have a tag called "work" without clashing.
- **notes to tags: many-to-many.** A note can have several tags, and a tag can be on several notes. A table cannot hold a list in one column cleanly, so the join table `note_tags` stores one row per note-and-tag pairing. Its composite primary key also stops the same tag being added to the same note twice.

When a user is deleted, their notes and tags are deleted too. When a note or tag is deleted, its `note_tags` rows are deleted with it (`ON DELETE CASCADE`). The application must check that a note and a tag belong to the same user before linking them.

## CREATE TABLE statements

CREATE TABLE users (
user_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
email VARCHAR(255) NOT NULL UNIQUE,
password_hash VARCHAR(255) NOT NULL,
display_name VARCHAR(100) NOT NULL,
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notes (
note_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
user_id BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
title VARCHAR(100) NOT NULL,
body TEXT NOT NULL DEFAULT '',
created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tags (
tag_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
user_id BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
name VARCHAR(50) NOT NULL,
UNIQUE (user_id, name)
);

CREATE TABLE note_tags (
note_id BIGINT NOT NULL REFERENCES notes (note_id) ON DELETE CASCADE,
tag_id BIGINT NOT NULL REFERENCES tags (tag_id) ON DELETE CASCADE,
PRIMARY KEY (note_id, tag_id)
);

CREATE INDEX idx_notes_user_created ON notes (user_id, created_at DESC);
CREATE INDEX idx_note_tags_tag_id ON note_tags (tag_id);

## Example queries

**1. The 20 newest notes for one user (backs `GET /notes`):**
SELECT note_id, title, created_at
FROM notes
WHERE user_id = 1
ORDER BY created_at DESC
LIMIT 20;

**2. All notes with the tag "work" (uses JOINs):**
SELECT n.note_id, n.title, n.created_at
FROM notes n
JOIN note_tags nt ON nt.note_id = n.note_id
JOIN tags t ON t.tag_id = nt.tag_id
WHERE n.user_id = 1
AND t.name = 'work'
ORDER BY n.created_at DESC;

**3. How many notes each tag has, including tags with none:**
SELECT t.name, COUNT(nt.note_id) AS note_count
FROM tags t
LEFT JOIN note_tags nt ON nt.tag_id = t.tag_id
WHERE t.user_id = 1
GROUP BY t.tag_id, t.name
ORDER BY note_count DESC;

**4. Update a note (backs `PUT /notes/{id}`):**
UPDATE notes
SET title = 'Buy milk and eggs', updated_at = now()
WHERE note_id = 101 AND user_id = 1;

## Indexes

- **`idx_notes_user_created` on `notes (user_id, created_at DESC)`.** Almost every request asks for one user's newest notes. This index lets the database jump to that user's rows already sorted by date, instead of scanning the whole notes table and sorting it. This matters most as the table grows to hundreds of millions of rows.
- **`idx_note_tags_tag_id` on `note_tags (tag_id)`.** The primary key already speeds up lookups that start with `note_id`, but finding all notes for a tag starts with `tag_id`, and this index makes that fast.

## SQL or NoSQL?

I chose SQL. QuickNotes data is structured and relational: users own notes and tags, and notes and tags are linked many-to-many. A relational database enforces these links with foreign keys, stops duplicate accounts with a UNIQUE email, and keeps changes safe with transactions, for example creating a note and attaching its tags either fully succeeds or fully fails. Queries like "all notes with a tag" are natural with JOINs. A NoSQL document store would suit this less, because tags shared between notes would have to be duplicated inside documents and kept consistent by application code. One estimated size, about 730 GB of notes per year for a million users, is well within what a single PostgreSQL primary with read replicas can handle, so the extra scaling a NoSQL system offers is not needed yet.
