const API_URL = "https://jsonplaceholder.typicode.com/posts";
const MAX_TITLE_LENGTH = 100;

const loadBtn = document.querySelector("#load-btn");
const statusEl = document.querySelector("#status");
const form = document.querySelector("#note-form");
const titleInput = document.querySelector("#title-input");
const bodyInput = document.querySelector("#body-input");
const submitBtn = document.querySelector("#submit-btn");
const notesList = document.querySelector("#notes-list");

// Each note: { key, id, title, body, local }
// key  = unique id used only by this page (the API gives every created note id 101)
// local = true for notes created during this visit (see the comment on deleteNote)
let notes = [];
let nextKey = 1;
let busy = false;

// ---------- Reusable request helper ----------

async function request(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`Server responded with status ${response.status}`);
  }

  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    data = null; // some responses have no JSON body
  }

  return { status: response.status, data: data };
}

// ---------- UI helpers ----------

function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = type || "";
}

function setBusy(value) {
  busy = value;
  loadBtn.disabled = value;
  submitBtn.disabled = value;
  document.querySelectorAll(".delete-btn").forEach((button) => {
    button.disabled = value;
  });
}

function friendlyError(error) {
  if (error instanceof TypeError) {
    return "Network problem: could not reach the server. Check your connection and try again.";
  }
  return `Something went wrong (${error.message}). Please try again.`;
}

function render() {
  notesList.replaceChildren();

  if (notes.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "No notes to show yet. Load notes or add one above.";
    notesList.appendChild(empty);
    return;
  }

  notes.forEach((note) => {
    const item = document.createElement("li");
    item.className = note.local ? "note-card local" : "note-card";

    const title = document.createElement("h3");
    title.textContent = note.title;

    const body = document.createElement("p");
    body.className = "note-body";
    body.textContent = note.body || "(no body)";

    const source = document.createElement("small");
    source.textContent = note.local
      ? "Created in this visit (the practice API does not store it)"
      : `Server note #${note.id}`;

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "delete-btn";
    deleteBtn.textContent = "Delete";
    deleteBtn.disabled = busy;
    deleteBtn.addEventListener("click", () => deleteNote(note));

    item.append(title, body, source, deleteBtn);
    notesList.appendChild(item);
  });
}

// ---------- GET: load 10 notes ----------

async function loadNotes() {
  setBusy(true);
  setStatus("Loading notes...", "loading");

  try {
    const result = await request(`${API_URL}?_limit=10`);

    if (!Array.isArray(result.data)) {
      throw new Error("Unexpected response from the server");
    }

    notes = result.data.map((post) => ({
      key: nextKey++,
      id: post.id,
      title: post.title,
      body: post.body,
      local: false,
    }));
    render();

    const count = notes.length;
    if (count === 0) {
      setStatus("The server returned no notes.", "success");
    } else {
      setStatus(
        `Loaded ${count} ${count === 1 ? "note" : "notes"} from the server.`,
        "success",
      );
    }
  } catch (error) {
    setStatus(friendlyError(error), "error");
  } finally {
    setBusy(false);
  }
}

// ---------- POST: create a note ----------

async function createNote(title, body) {
  setBusy(true);
  setStatus("Creating note...", "loading");

  try {
    const result = await request(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title, body: body, userId: 1 }),
    });

    const created = result.data;
    notes.unshift({
      key: nextKey++,
      id: created.id,
      title: created.title,
      body: created.body,
      local: true,
    });
    render();

    form.reset();
    titleInput.focus();
    setStatus(
      `Note created (status ${result.status}, id ${created.id}).`,
      "success",
    );
  } catch (error) {
    setStatus(friendlyError(error), "error");
  } finally {
    setBusy(false);
  }
}

// ---------- DELETE: remove a note ----------

// JSONPlaceholder only pretends to save changes: a note created with POST gets
// the id 101 but is never stored, so DELETE /posts/101 would not refer to a real
// note. My approach: notes that were loaded from the server are deleted with a
// real DELETE request and removed from the list only if it succeeds. Notes that
// were created during this visit only exist on this page, so they are removed
// locally without a request, and the status message says so.
async function deleteNote(note) {
  if (busy) {
    return;
  }
  setBusy(true);

  try {
    if (note.local) {
      notes = notes.filter((item) => item.key !== note.key);
      render();
      setStatus(
        "Note removed. It only existed on this page, so no server request was needed.",
        "success",
      );
    } else {
      setStatus(`Deleting note ${note.id}...`, "loading");
      const result = await request(`${API_URL}/${note.id}`, {
        method: "DELETE",
      });
      notes = notes.filter((item) => item.key !== note.key);
      render();
      setStatus(
        `Note deleted (status ${result.status}, id ${note.id}).`,
        "success",
      );
    }
  } catch (error) {
    setStatus(friendlyError(error), "error");
  } finally {
    setBusy(false);
  }
}

// ---------- Events ----------

loadBtn.addEventListener("click", loadNotes);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (busy) {
    return;
  }

  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  if (title === "") {
    setStatus("Please enter a title.", "error");
    return;
  }
  if (title.length > MAX_TITLE_LENGTH) {
    setStatus(
      `The title must be ${MAX_TITLE_LENGTH} characters or fewer (now ${title.length}).`,
      "error",
    );
    return;
  }

  createNote(title, body);
});

// ---------- Start ----------

render();
