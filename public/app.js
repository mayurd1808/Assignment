const authView = document.querySelector("#auth-view");
const dashboardView = document.querySelector("#dashboard-view");
const authMessage = document.querySelector("#auth-message");
const dashboardMessage = document.querySelector("#dashboard-message");
const loginForm = document.querySelector("#login-form");
const signupForm = document.querySelector("#signup-form");
const noteForm = document.querySelector("#note-form");
const notesList = document.querySelector("#notes-list");
const noteCount = document.querySelector("#note-count");
const welcomeTitle = document.querySelector("#welcome-title");

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function setMessage(element, message, isSuccess = false) {
  element.textContent = message;
  element.classList.toggle("success", isSuccess);
}

function showDashboard(user) {
  authView.classList.add("hidden");
  dashboardView.classList.remove("hidden");
  welcomeTitle.textContent = `Welcome, ${user.name}`;
  setMessage(authMessage, "");
  loadNotes();
}

function showAuth() {
  dashboardView.classList.add("hidden");
  authView.classList.remove("hidden");
}

function renderNotes(notes) {
  noteCount.textContent = `${notes.length} stored`;
  notesList.innerHTML = "";

  if (!notes.length) {
    notesList.innerHTML = '<div class="empty-state">No notes yet. Add your first saved item above.</div>';
    return;
  }

  for (const note of notes) {
    const card = document.createElement("article");
    card.className = "note-card";
    card.innerHTML = `
      <header>
        <div>
          <h4></h4>
          <time></time>
        </div>
        <button class="delete-button" type="button" aria-label="Delete note">x</button>
      </header>
      <p></p>
    `;
    card.querySelector("h4").textContent = note.title;
    card.querySelector("time").textContent = new Date(`${note.created_at}Z`).toLocaleString();
    card.querySelector("p").textContent = note.body;
    card.querySelector("button").addEventListener("click", async () => {
      try {
        const data = await api(`/api/notes/${note.id}`, { method: "DELETE" });
        renderNotes(data.notes);
      } catch (error) {
        setMessage(dashboardMessage, error.message);
      }
    });
    notesList.append(card);
  }
}

async function loadNotes() {
  try {
    const data = await api("/api/notes");
    renderNotes(data.notes);
  } catch (error) {
    setMessage(dashboardMessage, error.message);
  }
}

document.querySelectorAll("[data-auth-tab]").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("[data-auth-tab]").forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    const mode = tab.dataset.authTab;
    loginForm.classList.toggle("hidden", mode !== "login");
    signupForm.classList.toggle("hidden", mode !== "signup");
    setMessage(authMessage, "");
  });
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  try {
    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(formData))
    });
    loginForm.reset();
    showDashboard(data.user);
  } catch (error) {
    setMessage(authMessage, error.message);
  }
});

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(signupForm);
  try {
    const data = await api("/api/signup", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(formData))
    });
    signupForm.reset();
    showDashboard(data.user);
  } catch (error) {
    setMessage(authMessage, error.message);
  }
});

noteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(noteForm);
  try {
    const data = await api("/api/notes", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(formData))
    });
    noteForm.reset();
    setMessage(dashboardMessage, "Note saved.", true);
    renderNotes(data.notes);
  } catch (error) {
    setMessage(dashboardMessage, error.message);
  }
});

document.querySelector("#logout-button").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  showAuth();
});

api("/api/me")
  .then((data) => {
    if (data.user) showDashboard(data.user);
  })
  .catch(() => showAuth());
