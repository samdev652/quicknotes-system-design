# QuickNotes API Design

This is the API the backend team should build for the real QuickNotes service. It is not the JSONPlaceholder practice API used by the demo client.

## Conventions

- Base URL: `https://api.quicknotes.example/v1`
- All requests and responses use JSON (`Content-Type: application/json`).
- Every endpoint except registration and login needs the header `Authorization: Bearer <token>`.
- Paths use plural nouns, and the HTTP method says what happens (GET reads, POST creates, PUT replaces, DELETE removes).
- List endpoints are paginated with `?page=1&limit=20`.
- Users can only see and change their own notes.

## Endpoints

| Method | Path          | Description                                                                      | Success status |
| ------ | ------------- | -------------------------------------------------------------------------------- | -------------- |
| POST   | `/users`      | Register a new account                                                           | 201 Created    |
| POST   | `/auth/login` | Log in and receive a token                                                       | 200 OK         |
| GET    | `/notes`      | List the logged-in user's notes (supports `page`, `limit`, `tag` and `q` search) | 200 OK         |
| GET    | `/notes/{id}` | Get one note                                                                     | 200 OK         |
| POST   | `/notes`      | Create a note                                                                    | 201 Created    |
| PUT    | `/notes/{id}` | Replace a note's title, body and tags                                            | 200 OK         |
| DELETE | `/notes/{id}` | Delete a note                                                                    | 204 No Content |
| GET    | `/tags`       | List the user's tags                                                             | 200 OK         |
| POST   | `/tags`       | Create a tag                                                                     | 201 Created    |

## Examples

### Create a note: `POST /notes`

Request body:

{
"title": "Buy milk",
"body": "Two litres of fresh milk and bread.",
"tags": ["personal", "shopping"]
}

Response: `201 Created`

{
"id": 101,
"title": "Buy milk",
"body": "Two litres of fresh milk and bread.",
"tags": ["personal", "shopping"],
"userId": 1,
"createdAt": "2026-11-02T08:15:00Z",
"updatedAt": "2026-11-02T08:15:00Z"
}

### List notes: `GET /notes?page=1&limit=2`

Response: `200 OK`

{
"data": [
{
"id": 101,
"title": "Buy milk",
"body": "Two litres of fresh milk and bread.",
"tags": ["personal", "shopping"],
"createdAt": "2026-11-02T08:15:00Z"
},
{
"id": 100,
"title": "Revise databases",
"body": "Joins and indexes.",
"tags": ["study"],
"createdAt": "2026-11-01T17:40:00Z"
}
],
"page": 1,
"limit": 2,
"total": 57
}

### Log in: `POST /auth/login`

Request body:

{
"email": "amina@example.com",
"password": "a-strong-password"
}

Response: `200 OK`

{
"token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
"expiresIn": 3600
}

## Error codes

Every error uses the same body shape:

{
"error": {
"code": "VALIDATION_ERROR",
"message": "The title is required.",
"details": [{ "field": "title", "issue": "must not be empty" }]
}
}

| Status                    | Meaning                             | Example of when it happens                                                 |
| ------------------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| 400 Bad Request           | The request is invalid or malformed | `POST /notes` with no `title`, a title over 100 characters, or broken JSON |
| 401 Unauthorized          | The user is not logged in           | Any `/notes` request with a missing, expired or invalid token              |
| 403 Forbidden             | Logged in, but not allowed          | A user sends `DELETE /notes/42` for a note that belongs to another user    |
| 404 Not Found             | The resource does not exist         | `GET /notes/9999` when no note has that id                                 |
| 500 Internal Server Error | The server failed unexpectedly      | The database is unreachable while handling `POST /notes`                   |

Example 404 body:

{
"error": {
"code": "NOT_FOUND",
"message": "No note exists with id 9999."
}
}

Example 500 body:

{
"error": {
"code": "INTERNAL_ERROR",
"message": "Something went wrong on our side. Please try again later."
}
}
