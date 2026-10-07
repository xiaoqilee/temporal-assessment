const form = document.querySelector("#opening-form");
const formError = document.querySelector("#form-error");
const openingsEl = document.querySelector("#openings");
const waitlistEl = document.querySelector("#waitlist");

const PHASE_LABELS = {
  offering: "Offering",
  filled: "Filled",
  unfilled: "Unfilled",
  stopped: "Stopped",
};
const STATUS_LABELS = {
  waiting: "Waiting",
  offered: "Has the offer",
  accepted: "Accepted",
  declined: "Declined",
  timed_out: "Timed out",
  withdrawn: "Offer withdrawn",
  not_reached: "Not needed",
};

// Default the form to the next whole hour within salon hours (9 AM to 6 PM).
const next = new Date();
next.setHours(next.getHours() + 1, 0, 0, 0);
if (next.getHours() >= 18) next.setDate(next.getDate() + 1);
if (next.getHours() < 9 || next.getHours() >= 18) next.setHours(10);
form.startsAt.value = toLocalInput(next);

function toLocalInput(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function describe(opening) {
  const when = new Date(opening.startsAt);
  return `${opening.service} with ${opening.stylist} · ${when.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
}

function countdown(expiresAt) {
  const seconds = Math.max(0, Math.round((new Date(expiresAt) - Date.now()) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} left to reply`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  formError.hidden = true;
  const body = Object.fromEntries(new FormData(form));
  const response = await fetch("/api/openings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    formError.textContent = (await response.json()).error ?? "Could not post the opening.";
    formError.hidden = false;
  }
  await refresh();
});

const clientForm = document.querySelector("#client-form");
const clientError = document.querySelector("#client-error");
clientForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clientError.hidden = true;
  const data = new FormData(clientForm);
  const body = {
    name: data.get("name"),
    phone: data.get("phone"),
    service: data.get("service"),
    stylistPreference: data.get("stylistPreference"),
    availableDays: data.getAll("availableDays"),
    availableTimes: data.getAll("availableTimes"),
  };
  const response = await fetch("/api/waitlist", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    clientError.textContent = (await response.json()).error ?? "Could not add the client.";
    clientError.hidden = false;
    return;
  }
  clientForm.name.value = "";
  clientForm.phone.value = "";
  await loadWaitlist();
});

openingsEl.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === "stop" && !confirm("Stop offering this opening?")) return;
  button.disabled = true;
  await fetch(`/api/openings/${encodeURIComponent(id)}/${action}`, { method: "POST" });
  await refresh();
});

function renderOpening(state) {
  const { opening, phase, candidates, ineligible, history } = state;
  const current = candidates.find((c) => c.client.id === state.currentClientId);
  const winner = candidates.find((c) => c.status === "accepted");
  let headline = "";
  if (phase === "offering" && current) {
    headline = `Offer is with <strong>${escapeHtml(current.client.name)}</strong> · <span class="countdown" data-expires="${current.expiresAt}">${countdown(current.expiresAt)}</span>`;
  } else if (phase === "offering") {
    headline = "Starting…";
  } else if (phase === "filled") {
    headline = `Booked: <strong>${escapeHtml(winner?.client.name ?? "")}</strong>`;
  } else if (phase === "unfilled") {
    headline = "Nobody on the waitlist accepted. Opening is unfilled.";
  } else {
    headline = "Offers were stopped by staff.";
  }

  const rows = candidates
    .map(
      (c, i) => `<li class="status-${c.status}">
        <span>${i + 1}. ${escapeHtml(c.client.name)}</span>
        <span class="pill">${STATUS_LABELS[c.status]}</span>
        ${c.status === "offered" ? `<a href="/offer.html?opening=${encodeURIComponent(opening.id)}&client=${encodeURIComponent(c.client.id)}">Open their text →</a>` : ""}
      </li>`,
    )
    .join("");

  const skipped = ineligible.length
    ? `<details><summary>${ineligible.length} not eligible</summary><ul class="plain">${ineligible
        .map((i) => `<li>${escapeHtml(i.client.name)}: ${escapeHtml(i.reason)}</li>`)
        .join("")}</ul></details>`
    : "";

  const log = `<details><summary>Activity log</summary><ul class="plain">${history
    .map((h) => `<li><span class="muted">${new Date(h.at).toLocaleTimeString()}</span> ${escapeHtml(h.text)}</li>`)
    .join("")}</ul></details>`;

  const controls =
    phase === "offering"
      ? `<div class="controls">
          ${current ? `<button data-action="cancel-offer" data-id="${opening.id}" class="secondary">Cancel current offer</button>` : ""}
          <button data-action="stop" data-id="${opening.id}" class="danger">Stop offering</button>
        </div>`
      : "";

  return `<article class="card opening phase-${phase}">
    <div class="opening-head">
      <h3>${escapeHtml(describe(opening))}</h3>
      <span class="badge">${PHASE_LABELS[phase]}</span>
    </div>
    <p>${headline}</p>
    ${candidates.length ? `<ol class="candidates">${rows}</ol>` : `<p class="muted">No one on the waitlist matches this opening.</p>`}
    ${controls}
    ${skipped}
    ${log}
    <p class="muted small">Workflow ID: <code>${escapeHtml(opening.id)}</code></p>
  </article>`;
}

async function refresh() {
  try {
    const openings = await (await fetch("/api/openings")).json();
    if (Array.isArray(openings) && openings.length) {
      const openDetails = new Set(
        [...openingsEl.querySelectorAll("details[open]")].map((d) => d.closest("article")?.dataset.key + d.querySelector("summary").textContent),
      );
      openingsEl.innerHTML = openings.map(renderOpening).join("");
      openingsEl.querySelectorAll("article").forEach((article, i) => {
        article.dataset.key = openings[i].opening.id;
        article.querySelectorAll("details").forEach((d) => {
          if (openDetails.has(article.dataset.key + d.querySelector("summary").textContent)) d.open = true;
        });
      });
    }
  } catch {
    // Keep showing the last known state if the API is briefly unavailable.
  }
}

async function loadWaitlist() {
  const waitlist = await (await fetch("/api/waitlist")).json();
  waitlist.sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  waitlistEl.innerHTML = waitlist
    .map(
      (c) => `<tr>
        <td>${new Date(c.joinedAt).toLocaleDateString([], { month: "short", day: "numeric" })}</td>
        <td>${escapeHtml(c.name)}</td>
        <td>${escapeHtml(c.service)}</td>
        <td>${escapeHtml(c.stylistPreference)}</td>
        <td>${c.availableDays.length === 7 ? "Any day" : c.availableDays.join(", ")}</td>
        <td>${c.availableTimes.join(", ")}</td>
      </tr>`,
    )
    .join("");
}

setInterval(() => {
  document.querySelectorAll(".countdown").forEach((el) => (el.textContent = countdown(el.dataset.expires)));
}, 1000);
setInterval(refresh, 2000);
refresh();
loadWaitlist();
