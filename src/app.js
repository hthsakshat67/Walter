let assistantName = "Walter";
let currentUser = null;
let currentToken = localStorage.getItem("auth_token") || null;

const API_BASE = "/api/v1";

// Helper for authenticated API calls
async function apiCall(endpoint, method = "GET", body = null) {
  const headers = { "Content-Type": "application/json" };
  if (currentToken) {
    headers["Authorization"] = `Bearer ${currentToken}`;
  }

  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, options);
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(res.ok ? "Invalid server response" : `Server error (${res.status})`);
    }
    if (!res.ok) {
      throw new Error(data.error || data.message || "API request failed");
    }
    return data;
  } catch (err) {
    console.error(`[API Error] ${method} ${endpoint}:`, err);
    throw err;
  }
}

// Initial session check
async function checkAuthSession() {
  if (!currentToken) return;
  try {
    const res = await apiCall("/auth/me");
    if (res.user) {
      currentUser = res.user;
      if (res.user.assistantName) assistantName = res.user.assistantName;
    }
  } catch (err) {
    localStorage.removeItem("auth_token");
    currentToken = null;
    currentUser = null;
  }
}

const routes = [
  ["overview", "Overview", "Operations", "OV"],
  ["appointments", "Appointments", "Operations", "AP"],
  ["calendar", "Calendar", "Operations", "CA"],
  ["customers", "Customers", "Operations", "CU"],
  ["conversations", "Conversations", "Operations", "CO"],
  ["calls", "AI Phone Calls", "Operations", "PH"],
  ["whatsapp", "WhatsApp", "Channels", "WA"],
  ["email", "Email", "Channels", "EM"],
  ["services", "Services", "Configuration", "SV"],
  ["staff", "Staff", "Configuration", "ST"],
  ["automation", "Automation Rules", "Configuration", "AR"],
  ["analytics", "Analytics", "Configuration", "AN"],
  ["assistant", "AI Assistant Settings", "Configuration", "AI"],
  ["integrations", "Integrations", "Configuration", "IN"],
  ["billing", "Billing", "Configuration", "BI"],
  ["settings", "Business Settings", "Configuration", "SE"],
];

// Reactive State cache
let state = {
  appointments: [],
  conversations: [],
  calls: [],
  customers: [],
  services: [],
  staff: [],
  dashboardSummary: null,
  analytics: null,
  businessSettings: null,
  calendarEvents: [],
  calendarView: "month", // month, week, day
  calendarDate: new Date("2026-08-23T12:00:00"),
  calendarFilterStaff: "",
  calendarFilterService: "",
  calendarFilterSource: "",
  googleCalendarIntegration: null,
  loading: false,
  error: null,
};

let customerEditor = null;

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function emptyState(title, detail) {
  return `<div class="empty-state"><h3>${title}</h3><p>${detail}</p></div>`;
}

// API Services powering the frontend views
const appointmentService = {
  listToday: () => state.appointments,
  getById: (id) => state.appointments.find((appointment) => String(appointment.id) === String(id)),
  fetch: async () => {
    try {
      const data = await apiCall("/appointments");
      state.appointments = data.map((a) => ({
        id: a.id,
        date: new Date(a.startTime).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        time: new Date(a.startTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
        duration: `${a.service?.durationMinutes || 30}m`,
        customer: a.customer?.name || "Customer",
        service: a.service?.name || "Service",
        staff: a.staff?.name || "Staff",
        status: a.status,
        channel: a.channel,
      }));
    } catch (e) {
      console.warn("Using fallback appointment data if unauthorized");
    }
  },
  book: async (input) => {
    const res = await apiCall("/appointments", "POST", input);
    await stateManager.loadAll();
    return res;
  },
  reschedule: async (id, newStartTime) => {
    const res = await apiCall(`/appointments/${id}/reschedule`, "POST", { newStartTime });
    await stateManager.loadAll();
    return res;
  },
  cancel: async (id) => {
    const res = await apiCall(`/appointments/${id}/cancel`, "POST", { reason: "Cancelled from dashboard" });
    await stateManager.loadAll();
    return res;
  },
  confirm: async (id) => {
    const res = await apiCall(`/appointments/${id}/confirm`, "POST");
    await stateManager.loadAll();
    return res;
  },
};

const customerService = {
  list: () => state.customers,
  getById: (id) => state.customers.find((customer) => String(customer.id) === String(id)),
  fetch: async () => {
    try {
      const data = await apiCall("/customers");
      state.customers = data.map((customer) => ({
        id: customer.id,
        name: customer.name,
        email: customer.email || "",
        phone: customer.phone || "",
        segment: customer.segment || "Standard",
        notes: customer.notes || "",
      }));
    } catch (e) {}
  },
  create: async (data) => {
    await apiCall("/customers", "POST", data);
    await customerService.fetch();
  },
  update: async (id, data) => {
    await apiCall(`/customers/${id}`, "PATCH", data);
    await customerService.fetch();
  },
};

const serviceCatalog = {
  list: () => state.services,
  fetch: async () => {
    try {
      const data = await apiCall("/services");
      state.services = data.map((service) => ({
        id: service.id,
        name: service.name,
        description: service.description || "No description yet",
        duration: `${service.durationMinutes || 30} min`,
        buffer: `${service.bufferMinutes || 0} min buffer`,
        price: Number(service.price || 0).toLocaleString("en-US", { style: "currency", currency: "USD" }),
        active: service.active,
      }));
    } catch (e) {}
  },
};

const staffDirectory = {
  list: () => state.staff,
  fetch: async () => {
    try {
      const data = await apiCall("/staff");
      state.staff = data.map((staff) => ({
        id: staff.id,
        name: staff.name,
        title: staff.title || "Team member",
        email: staff.email || "No email",
        phone: staff.phone || "No phone",
        active: staff.active,
      }));
    } catch (e) {}
  },
};

const conversationService = {
  list: () => state.conversations,
  byChannel: (channel) => state.conversations.filter((item) => item.channel.toLowerCase() === channel.toLowerCase()),
  fetch: async () => {
    try {
      const data = await apiCall("/conversations");
      state.conversations = data.map((c) => ({
        id: c.id,
        customer: c.customer?.name || "Customer",
        channel: c.channel,
        time: new Date(c.lastMessageAt || c.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        intent: c.intent || "General inquiry",
        status: c.status,
        handler: c.handler || assistantName,
        result: c.result || "Processed",
      }));
    } catch (e) {}
  },
};

const callService = {
  latest: () => state.calls[0] || null,
  fetch: async () => {
    try {
      const data = await apiCall("/calls");
      state.calls = data.map((c) => ({
        id: c.id,
        customer: c.customer?.name || "Unknown customer",
        duration: c.duration || "02:43",
        result: c.appointmentAction || "Call completed",
      }));
    } catch (e) {}
  },
};

const notificationService = {
  messageFor: (action) => `${titleCase(action)} request processed by backend engine.`,
};

async function fetchCalendarEvents() {
  if (!currentToken) return;
  const year = state.calendarDate.getFullYear();
  const month = state.calendarDate.getMonth();
  const start = new Date(year, month, 1 - 7);
  const end = new Date(year, month + 1, 7);
  try {
    const data = await apiCall(`/calendar/events?start=${start.toISOString()}&end=${end.toISOString()}`);
    state.calendarEvents = data;
  } catch (err) {
    console.error("Failed to fetch calendar events:", err);
  }
}

const stateManager = {
  loadAll: async () => {
    if (!currentToken) return;
    state.loading = true;
    try {
      const [summary, analytics, gcalIntegration] = await Promise.all([
        apiCall("/dashboard/summary").catch(() => null),
        apiCall("/analytics/overview").catch(() => null),
        apiCall("/integrations/google-calendar").catch(() => null),
        appointmentService.fetch(),
        customerService.fetch(),
        serviceCatalog.fetch(),
        staffDirectory.fetch(),
        conversationService.fetch(),
        callService.fetch(),
      ]);
      if (summary) state.dashboardSummary = summary;
      if (analytics) state.analytics = analytics;
      if (gcalIntegration) state.googleCalendarIntegration = gcalIntegration;

      await fetchCalendarEvents();
    } catch (err) {
      state.error = err.message;
    } finally {
      state.loading = false;
      render();
    }
  },
};

const app = document.querySelector("#app");
let currentRoute = location.hash.replace("#/", "") || "landing";
let drawerAppointment = null;
let toastTimer;

function titleCase(value) {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

function badgeClass(status) {
  const value = String(status).toLowerCase();
  if (value.includes("confirmed") || value.includes("resolved") || value.includes("completed") || value.includes("active")) return "success";
  if (value.includes("risk") || value.includes("pending") || value.includes("awaiting")) return "warning";
  if (value.includes("cancel") || value.includes("no-show")) return "error";
  if (value.includes("human")) return "info";
  return "";
}

function showToast(message) {
  const toast = document.querySelector(".toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
}

function navigate(route) {
  currentRoute = route;
  location.hash = `/${route}`;
  render();
}

window.addEventListener("hashchange", () => {
  currentRoute = location.hash.replace("#/", "") || "landing";
  drawerAppointment = null;
  customerEditor = null;
  render();
});

function brand(extraClass = "") {
  return `<a class="brand ${extraClass}" href="#/landing" aria-label="AI Receptionist home">
    <span class="brand-mark">W</span>
    <span class="brand-copy"><span>AI Receptionist</span><small>${assistantName} front desk</small></span>
  </a>`;
}

function publicNav() {
  return `<nav class="public-nav">
    ${brand()}
    <div class="public-links">
      <button class="btn" data-route="pricing">Pricing</button>
      ${currentToken ? `<button class="btn primary" data-route="overview">Dashboard</button>` : `<button class="btn" data-route="login">Login</button><button class="btn primary" data-route="signup">Sign Up</button>`}
    </div>
  </nav>`;
}

function landing() {
  return `<main class="landing">${publicNav()}
    <section class="hero">
      <div class="hero-copy reveal">
        <div class="page-copy">
          <p class="eyebrow">Intelligent Front Desk Automation</p>
          <h1>Appointment Operations That Feel Effortless.</h1>
          <p>${assistantName} answers calls and messages, captures real customer details, and keeps every schedule change visible to your team.</p>
        </div>
        <div class="actions">
          <button class="btn primary" data-route="signup">Create Account</button>
          <button class="btn" data-route="login">Login</button>
        </div>
      </div>
      <div class="product-frame reveal">${productDemo()}</div>
    </section>
    <section class="section">
      <div class="section-inner sticky-demo">
        <div class="section-head">
          <p class="eyebrow">AI Receptionist</p>
          <h2>Built Around Appointments, Not Novelty.</h2>
          <p>The interface makes the receptionist's work legible: who contacted the business, what they needed, what ${assistantName} changed, and what still needs a human.</p>
          ${channelCards()}
        </div>
        <div class="product-frame">${phoneDemo()}</div>
      </div>
    </section>
    ${pricingSection()}
    <section class="section">
      <div class="section-inner final-cta">
        <p class="eyebrow">Ready For The Next Call</p>
        <h2>Put ${assistantName} On The Front Desk.</h2>
        <p>Launch a connected appointment workflow with authenticated accounts, editable customer records, and live backend data.</p>
        <button class="btn primary" data-route="signup">Create Account</button>
      </div>
    </section>
  </main>`;
}

function productDemo() {
  const summary = state.dashboardSummary || { appointmentsToday: 0, callsHandled: 0, pendingConfirmations: 0, noShowRisk: 0 };
  return `<div class="product-window">
    <div class="window-bar"><strong>${currentUser?.businessName || "Your Business"}</strong><span class="badge success">${assistantName} Online</span></div>
    <div class="window-body">
      <div class="metric-strip">
        ${metric(summary.appointmentsToday, "Appointments today")}
        ${metric(summary.callsHandled, "Calls handled")}
        ${metric(summary.pendingConfirmations, "Confirmations")}
        ${metric(summary.noShowRisk, "At risk")}
      </div>
      <div class="demo-grid">
        ${currentToken ? compactPreviewRows() : featureHighlights()}
        ${phoneDemo()}
      </div>
    </div>
  </div>`;
}

function featureHighlights() {
  return `<div class="feature-highlights">
    <div class="feature-highlight-card">
      <span class="feature-icon">📅</span>
      <strong>Smart Scheduling</strong>
      <span class="meta">Auto-fill open slots and reduce gaps in your calendar.</span>
    </div>
    <div class="feature-highlight-card">
      <span class="feature-icon">📞</span>
      <strong>AI Call Handling</strong>
      <span class="meta">Capture customer intent from every phone call automatically.</span>
    </div>
    <div class="feature-highlight-card">
      <span class="feature-icon">🔔</span>
      <strong>Instant Notifications</strong>
      <span class="meta">Get alerts for new bookings, cancellations, and no-shows.</span>
    </div>
    <div class="feature-highlight-card">
      <span class="feature-icon">📊</span>
      <strong>Live Dashboard</strong>
      <span class="meta">See your entire day at a glance with real-time metrics.</span>
    </div>
  </div>`;
}

function compactPreviewRows() {
  const rows = appointmentService.listToday();
  if (rows.length === 0) {
    return emptyState("No Appointments Yet", "Your live appointments appear here after you create an account and add customer bookings.");
  }
  return `<div class="preview-list">${rows.slice(0, 4).map((appointment) => `<div class="preview-appointment">
    <span class="meta">${appointment.time}</span>
    <span><strong>${appointment.customer}</strong><span class="meta">${appointment.service}</span></span>
    <span class="badge ${badgeClass(appointment.status)}">${appointment.status}</span>
  </div>`).join("")}</div>`;
}

function phoneDemo() {
  const latestCall = callService.latest();
  const displayCustomer = latestCall?.customer || state.customers[0]?.name || "New Customer";
  return `<aside class="phone-demo">
    <div>
      <small>Live Phone Call</small>
      <h3>${escapeHtml(displayCustomer)}</h3>
    </div>
    <p>Intent: ${latestCall?.result || "appointment request"}</p>
    <div class="row phone-row">
      <div class="row-main"><span class="row-title">${assistantName} found the next open slot</span><span class="meta">Customer details sync to the backend</span></div>
    </div>
    <span class="badge success">Ready To Schedule</span>
  </aside>`;
}

function channelCards() {
  return `<div class="grid two-col">
    ${["Phone", "WhatsApp", "Email", "Web"].map((channel) => `<article class="card"><h3>${channel}</h3><p>Capture intent and route it into the same appointment workflow.</p></article>`).join("")}
  </div>`;
}

function pricingSection() {
  const plans = [
    ["Starter", "$99", "One location, phone intake, reminders, and core appointment workflows."],
    ["Growth", "$249", "Omnichannel inbox, staff routing, analytics, and escalation controls."],
    ["Scale", "Custom", "Multi-location operations, advanced integrations, and priority support."],
  ];
  return `<section class="section"><div class="section-inner">
    <div class="section-head"><p class="eyebrow">Pricing</p><h2>Plans For Appointment-Based Teams.</h2></div>
    <div class="grid three-col">
      ${plans.map((plan, index) => `<article class="card price-card ${index === 1 ? "featured" : ""}">
        <h3>${plan[0]}</h3>
        <div class="metric-value">${plan[1]}</div>
        <p>${plan[2]}</p>
        <br><button class="btn ${index === 1 ? "primary" : ""}" data-route="signup">Choose ${plan[0]}</button>
      </article>`).join("")}
    </div>
  </div></section>`;
}

function authPage(kind) {
  const isLogin = kind === "login";
  return `<main class="landing">${publicNav()}
    <section class="auth-shell">
      <div class="auth-panel reveal">
        ${brand("auth-brand")}
        <div class="auth-copy">
          <h1>${isLogin ? "Welcome Back" : "Create Your Account"}</h1>
          <p>${isLogin ? "Sign in with your account credentials." : `Set up ${assistantName} with an authenticated workspace and real backend data.`}</p>
        </div>
        <form class="auth-form" id="auth-form-el">
          ${!isLogin ? `<label>Business Name<input class="input" id="auth-biz-name" autocomplete="organization" required></label>` : ""}
          <label>Email<input class="input" id="auth-email" type="email" autocomplete="email" required></label>
          <label>Password<input class="input" id="auth-password" type="password" autocomplete="${isLogin ? "current-password" : "new-password"}" minlength="8" required><span class="helper">Use at least 8 characters.</span></label>
          ${!isLogin ? `<label>Assistant Name<input class="input" id="auth-assistant-name" value="${assistantName}" required></label>` : ""}
          <div class="form-error" id="auth-error" hidden></div>
          <button class="btn primary" type="submit" id="auth-submit-btn">${isLogin ? "Login" : "Sign Up"}</button>
          <div class="auth-links">
            <a href="#/${isLogin ? "signup" : "login"}">${isLogin ? "Create An Account" : "Already Have An Account?"}</a>
            <a href="#/landing">Back To Site</a>
          </div>
        </form>
      </div>
    </section>
  </main>`;
}

function shell(content) {
  const groups = routes.reduce((acc, item) => ((acc[item[2]] ||= []).push(item), acc), {});
  return `<div class="app-shell">
    <aside class="sidebar">
      ${brand()}
      ${Object.entries(groups).map(([group, links]) => `<div class="nav-title">${group}</div>${links.map(([id, label, , short]) => `<button class="nav-link ${currentRoute === id ? "active" : ""}" data-route="${id}"><span class="nav-icon">${short}</span>${label}</button>`).join("")}`).join("")}
      <button class="nav-link danger" id="logout-btn" style="margin-top:2rem;">Sign out</button>
    </aside>
    <main class="main">
      <header class="topbar">
        <input class="search" aria-label="Search" placeholder="Search customers, appointments, conversations">
        <div class="actions">
          <span class="badge success">${assistantName} Online</span>
          <button class="btn primary" data-action="book">Book Appointment</button>
        </div>
      </header>
      <div class="content">${content}</div>
      <nav class="mobile-tabs" aria-label="Primary mobile navigation">
        ${routes.slice(0, 6).map(([id, label]) => `<button class="nav-link ${currentRoute === id ? "active" : ""}" data-route="${id}">${label}</button>`).join("")}
      </nav>
    </main>
    ${drawer()}<div class="toast" role="status"></div>
  </div>`;
}

function metric(value, label) {
  return `<div class="metric"><div class="eyebrow">${label}</div><div class="metric-value">${value}</div></div>`;
}

function overview() {
  const summary = state.dashboardSummary || { appointmentsToday: 0, callsHandled: 0, pendingConfirmations: 0, noShowRisk: 0 };
  return shell(`<div class="page-head">
    <div class="page-copy"><p class="eyebrow">${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })} - ${escapeHtml(currentUser?.businessName || "Your Business")}</p><h1>Today At A Glance</h1><p>Live operational work powered by authenticated backend APIs.</p></div>
    <div class="actions"><button class="btn" data-action="customer">Add Customer</button><button class="btn" data-route="calendar">View Calendar</button></div>
  </div>
  <div class="metric-strip">
    ${metric(summary.appointmentsToday, "Appointments today")}
    ${metric(summary.callsHandled, `Calls answered by ${assistantName}`)}
    ${metric(summary.pendingConfirmations, "Pending confirmations")}
    ${metric(summary.noShowRisk, "No-show risk")}
  </div>
  <div class="grid two-col">
    <section class="panel"><div class="panel-head"><div><h2>Today's Appointments</h2><p class="meta">Live queue for staff and assistant activity.</p></div><span class="badge warning">${summary.pendingConfirmations} Pending</span></div>${appointmentsList()}</section>
    <div class="grid">
      <section class="panel"><div class="panel-head"><div><h2>Active Conversations</h2><p class="meta">Recent customer intent across channels.</p></div></div>${conversationList()}</section>
      <section class="panel"><div class="panel-head"><div><h2>Recent Activity</h2></div></div>${activityList()}</section>
    </div>
  </div>`);
}

function appointmentsList(compact = false) {
  const rows = appointmentService.listToday();
  if (rows.length === 0) return emptyState("No Appointments Found", "Book an appointment to start building your live schedule.");
  return `<div class="list">${rows.map((appointment) => `<button class="row timeline-item" data-open-appt="${appointment.id}">
    <span class="meta">${appointment.time}</span>
    <span class="row-main"><span class="row-title">${appointment.customer}</span><span class="meta">${appointment.service} with ${appointment.staff} - ${appointment.duration} - ${appointment.channel}</span></span>
    <span class="badge ${badgeClass(appointment.status)}">${appointment.status}</span>
  </button>`).slice(0, compact ? 4 : undefined).join("")}</div>`;
}

function appointmentsPage() {
  return shell(`<div class="page-head">
    <div class="page-copy"><p class="eyebrow">Appointment Management</p><h1>Appointments</h1><p>Book, reschedule, cancel, confirm, and complete appointments while preserving channel and staff context.</p></div>
    <div class="actions"><button class="btn primary" data-action="book">Book</button><button class="btn" data-action="quick-reschedule">Reschedule</button><button class="btn danger" data-action="cancel">Cancel</button></div>
  </div>
  <div class="tabs">${["Day", "Week", "Month"].map((tab, index) => `<button class="tab ${index === 1 ? "active" : ""}">${tab}</button>`).join("")}</div>
  ${appointmentTable()}`);
}

function appointmentTable() {
  const rows = appointmentService.listToday();
  return `<div class="table-wrap">
    <table><thead><tr><th>Time</th><th>Customer</th><th>Service</th><th>Staff</th><th>Channel</th><th>Status</th></tr></thead>
    <tbody>${rows.map((a) => `<tr data-open-appt="${a.id}"><td>${a.time}<br><span class="meta">${a.duration}</span></td><td>${a.customer}</td><td>${a.service}</td><td>${a.staff}</td><td>${a.channel}</td><td><span class="badge ${badgeClass(a.status)}">${a.status}</span></td></tr>`).join("")}</tbody></table>
    <div class="mobile-list">${rows.map((a) => `<button class="row" data-open-appt="${a.id}"><span class="row-main"><span class="row-title">${a.time} - ${a.customer}</span><span class="meta">${a.service} with ${a.staff}</span></span><span class="badge ${badgeClass(a.status)}">${a.status}</span></button>`).join("")}</div>
  </div>`;
}

function googleCalendarSimulatorModal() {
  if (!state.gcalSimulatorOpen) return "";
  return `<div class="modal-backdrop open" role="dialog" aria-modal="true" style="z-index:9999;">
    <form class="modal-panel auth-form" id="gcal-simulator-form-el">
      <div class="page-head compact">
        <div class="page-copy">
          <p class="eyebrow">Google Calendar Simulator</p>
          <h2>Simulate External Event</h2>
        </div>
        <button class="btn" type="button" id="close-gcal-simulator-btn">Close</button>
      </div>
      <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1rem; line-height:1.4;">
        Add a busy event directly to the Google Calendar mock database. This event will show on your dashboard in orange/green and automatically block availability in the receptionist's scheduling checks.
      </p>
      <label>Event Name / Summary
        <input class="input" id="sim-event-summary" placeholder="e.g. Lunch break or Dental clinic session" required>
      </label>
      <label>Description (optional)
        <input class="input" id="sim-event-desc" placeholder="e.g. Out of office">
      </label>
      <label>Start Date & Time
        <input class="input" id="sim-event-start" type="datetime-local" value="${new Date().toISOString().slice(0, 16)}" required>
      </label>
      <label>End Date & Time
        <input class="input" id="sim-event-end" type="datetime-local" value="${new Date(Date.now() + 3600000).toISOString().slice(0, 16)}" required>
      </label>
      <div class="form-error" id="sim-event-error" hidden></div>
      <button class="btn primary" type="submit">Create Simulated Event</button>
    </form>
  </div>`;
}

function calendarPage() {
  const view = state.calendarView;
  const activeDate = state.calendarDate;
  
  let headerText = "";
  if (view === "month") {
    headerText = activeDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  } else if (view === "week") {
    const startOfWeek = new Date(activeDate);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 6);
    headerText = `${startOfWeek.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${endOfWeek.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  } else {
    headerText = activeDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }

  const filteredEvents = state.calendarEvents.filter(evt => {
    if (state.calendarFilterStaff && evt.appointment && evt.appointment.staffId !== state.calendarFilterStaff) return false;
    if (state.calendarFilterService && evt.appointment && evt.appointment.serviceId !== state.calendarFilterService) return false;
    if (state.calendarFilterSource === "LOCAL" && evt.source !== "LOCAL") return false;
    if (state.calendarFilterSource === "GOOGLE" && evt.source !== "GOOGLE") return false;
    return true;
  });

  const year = activeDate.getFullYear();
  const month = activeDate.getMonth();
  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const prevTotalDays = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    cells.push({
      dayNum: prevTotalDays - i,
      isCurrentMonth: false,
      date: new Date(year, month - 1, prevTotalDays - i),
    });
  }
  for (let i = 1; i <= totalDays; i++) {
    cells.push({
      dayNum: i,
      isCurrentMonth: true,
      date: new Date(year, month, i),
    });
  }
  const remaining = cells.length % 7;
  if (remaining > 0) {
    const nextDays = 7 - remaining;
    for (let i = 1; i <= nextDays; i++) {
      cells.push({
        dayNum: i,
        isCurrentMonth: false,
        date: new Date(year, month + 1, i),
      });
    }
  }
  while (cells.length < 35) {
    const lastCell = cells[cells.length - 1];
    const nextDate = new Date(lastCell.date);
    nextDate.setDate(nextDate.getDate() + 1);
    cells.push({
      dayNum: nextDate.getDate(),
      isCurrentMonth: false,
      date: nextDate,
    });
  }

  const startOfWeek = new Date(activeDate);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(d.getDate() + i);
    weekDays.push(d);
  }

  let calendarGridHtml = "";
  
  if (view === "month") {
    const headers = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    calendarGridHtml = `
      <div class="calendar-month-wrap">
        <div class="cal-month-headers">
          ${headers.map(h => `<div class="cal-month-header">${h}</div>`).join("")}
        </div>
        <div class="cal-month-grid">
          ${cells.map(cell => {
            const cellDateStr = cell.date.toDateString();
            const isToday = cellDateStr === new Date().toDateString();
            
            const cellEvents = filteredEvents.filter(evt => {
              const start = new Date(evt.startTime);
              const end = new Date(evt.endTime);
              const cellStart = new Date(cell.date);
              cellStart.setHours(0,0,0,0);
              const cellEnd = new Date(cell.date);
              cellEnd.setHours(23,59,59,999);
              return start < cellEnd && end > cellStart;
            });

            return `
              <div class="cal-month-day ${cell.isCurrentMonth ? "" : "offset-month"} ${isToday ? "today-cell" : ""}" data-date="${cell.date.toISOString()}">
                <div class="day-number-label">
                  <span class="day-badge-num">${cell.dayNum}</span>
                  ${isToday ? `<span class="today-marker-dot"></span>` : ""}
                </div>
                <div class="day-events-container">
                  ${cellEvents.map(evt => {
                    const isGoogle = evt.source === "GOOGLE";
                    return `
                      <button class="cal-event-chip ${isGoogle ? "gcal-event" : "local-event"} ${badgeClass(evt.status || "")}" data-open-appt="${evt.id}" title="${escapeHtml(evt.title)}">
                        <span class="event-time-prefix">${new Date(evt.startTime).toLocaleTimeString([], {hour: 'numeric', minute:'2-digit'})}</span>
                        <span class="event-title-text">${escapeHtml(evt.title)}</span>
                      </button>
                    `;
                  }).join("")}
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  } else if (view === "week") {
    const hourRows = Array.from({ length: 11 }, (_, i) => i + 8);
    
    calendarGridHtml = `
      <div class="calendar-week-wrap">
        <div class="cal-week-headers-row">
          <div class="time-column-header"></div>
          ${weekDays.map(d => {
            const isToday = d.toDateString() === new Date().toDateString();
            return `
              <div class="week-column-header ${isToday ? "today-header" : ""}">
                <div class="week-day-name">${d.toLocaleDateString("en-US", { weekday: "short" })}</div>
                <div class="week-day-num">${d.getDate()}</div>
              </div>
            `;
          }).join("")}
        </div>
        
        <div class="cal-week-grid-body">
          <div class="time-labels-col">
            ${hourRows.map(h => `<div class="time-label-row"><span>${h > 12 ? h - 12 : h} ${h >= 12 ? "PM" : "AM"}</span></div>`).join("")}
          </div>
          
          <div class="week-days-cols-container">
            ${weekDays.map(d => {
              const dayStart = new Date(d);
              dayStart.setHours(0,0,0,0);
              const dayEnd = new Date(d);
              dayEnd.setHours(23,59,59,999);
              
              const dayEvents = filteredEvents.filter(evt => {
                const start = new Date(evt.startTime);
                const end = new Date(evt.endTime);
                return start < dayEnd && end > dayStart;
              });

              return `
                <div class="week-day-col" data-date="${d.toISOString()}">
                  ${hourRows.map(h => {
                    const clickDate = new Date(d);
                    clickDate.setHours(h, 0, 0, 0);
                    return `<div class="hour-grid-cell" data-action="quick-book-slot" data-slot="${clickDate.toISOString()}" title="Click to quick book slot at ${h > 12 ? h - 12 : h}:00 ${h >= 12 ? "PM" : "AM"}"></div>`;
                  }).join("")}
                  
                  ${dayEvents.map(evt => {
                    const isGoogle = evt.source === "GOOGLE";
                    const start = new Date(evt.startTime);
                    const end = new Date(evt.endTime);
                    
                    const startHour = start.getHours() + start.getMinutes() / 60;
                    const endHour = end.getHours() + end.getMinutes() / 60;
                    
                    const clampedStart = Math.max(8, Math.min(18, startHour));
                    const clampedEnd = Math.max(8, Math.min(18, endHour));
                    
                    const top = (clampedStart - 8) * 50;
                    const height = Math.max(24, (clampedEnd - clampedStart) * 50);
                    
                    return `
                      <div class="cal-event-card ${isGoogle ? "gcal-card" : "local-card"} ${badgeClass(evt.status || "")}" 
                           style="top:${top}px; height:${height}px;" 
                           data-open-appt="${evt.id}">
                        <div class="card-time">${start.toLocaleTimeString([], {hour: 'numeric', minute:'2-digit'})} - ${end.toLocaleTimeString([], {hour: 'numeric', minute:'2-digit'})}</div>
                        <div class="card-title">${escapeHtml(evt.title)}</div>
                        ${evt.description ? `<div class="card-desc">${escapeHtml(evt.description)}</div>` : ""}
                      </div>
                    `;
                  }).join("")}
                </div>
              `;
            }).join("")}
          </div>
        </div>
      </div>
    `;
  } else {
    const hourRows = Array.from({ length: 11 }, (_, i) => i + 8);
    const d = activeDate;
    const dayStart = new Date(d);
    dayStart.setHours(0,0,0,0);
    const dayEnd = new Date(d);
    dayEnd.setHours(23,59,59,999);
    
    const dayEvents = filteredEvents.filter(evt => {
      const start = new Date(evt.startTime);
      const end = new Date(evt.endTime);
      return start < dayEnd && end > dayStart;
    });

    calendarGridHtml = `
      <div class="calendar-day-wrap">
        <div class="cal-week-grid-body">
          <div class="time-labels-col">
            ${hourRows.map(h => `<div class="time-label-row"><span>${h > 12 ? h - 12 : h} ${h >= 12 ? "PM" : "AM"}</span></div>`).join("")}
          </div>
          
          <div class="week-days-cols-container" style="grid-template-columns: 1fr;">
            <div class="week-day-col single-day-col" data-date="${d.toISOString()}">
              ${hourRows.map(h => {
                const clickDate = new Date(d);
                clickDate.setHours(h, 0, 0, 0);
                return `<div class="hour-grid-cell" data-action="quick-book-slot" data-slot="${clickDate.toISOString()}" title="Click to quick book slot at ${h > 12 ? h - 12 : h}:00 ${h >= 12 ? "PM" : "AM"}"></div>`;
              }).join("")}
              
              ${dayEvents.map(evt => {
                const isGoogle = evt.source === "GOOGLE";
                const start = new Date(evt.startTime);
                const end = new Date(evt.endTime);
                
                const startHour = start.getHours() + start.getMinutes() / 60;
                const endHour = end.getHours() + end.getMinutes() / 60;
                
                const clampedStart = Math.max(8, Math.min(18, startHour));
                const clampedEnd = Math.max(8, Math.min(18, endHour));
                
                const top = (clampedStart - 8) * 50;
                const height = Math.max(24, (clampedEnd - clampedStart) * 50);
                
                return `
                  <div class="cal-event-card ${isGoogle ? "gcal-card" : "local-card"} ${badgeClass(evt.status || "")}" 
                       style="top:${top}px; height:${height}px;" 
                       data-open-appt="${evt.id}">
                    <div class="card-time">${start.toLocaleTimeString([], {hour: 'numeric', minute:'2-digit'})} - ${end.toLocaleTimeString([], {hour: 'numeric', minute:'2-digit'})}</div>
                    <div class="card-title">${escapeHtml(evt.title)}</div>
                    ${evt.description ? `<div class="card-desc">${escapeHtml(evt.description)}</div>` : ""}
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  const staffList = staffDirectory.list();
  const serviceList = serviceCatalog.list();

  return shell(`
    <div class="page-head calendar-page-head">
      <div class="page-copy">
        <p class="eyebrow" id="calendar-view-subtitle">Live Real-Time Appointments</p>
        <div style="display:flex; align-items:center; gap:1.5rem; flex-wrap:wrap;">
          <h1 id="calendar-header-title" style="margin:0;">${headerText}</h1>
          <div class="clock-widget" id="realtime-clock">EST Time</div>
        </div>
      </div>
      
      <div class="actions calendar-view-actions">
        <div class="btn-group">
          <button class="btn secondary ${view === "day" ? "active" : ""}" id="view-day-btn">Day</button>
          <button class="btn secondary ${view === "week" ? "active" : ""}" id="view-week-btn">Week</button>
          <button class="btn secondary ${view === "month" ? "active" : ""}" id="view-month-btn">Month</button>
        </div>
        <button class="btn info" id="open-gcal-simulator-btn">⚙️ Google Calendar Simulator</button>
        
      </div>
    </div>

    <div class="cal-toolbar">
      <div class="cal-nav-controls">
        <button class="btn secondary compact" id="cal-prev-btn">&larr; Previous</button>
        <button class="btn secondary compact" id="cal-today-btn">Today</button>
        <button class="btn secondary compact" id="cal-next-btn">Next &rarr;</button>
      </div>
      
      <div class="cal-filter-controls">
        <select class="select compact" id="cal-filter-staff" aria-label="Filter by Staff">
          <option value="">All Staff</option>
          ${staffList.map(s => `<option value="${s.id}" ${state.calendarFilterStaff === s.id ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("")}
        </select>
        <select class="select compact" id="cal-filter-service" aria-label="Filter by Service">
          <option value="">All Services</option>
          ${serviceList.map(s => `<option value="${s.id}" ${state.calendarFilterService === s.id ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("")}
        </select>
        <select class="select compact" id="cal-filter-source" aria-label="Filter by Source">
          <option value="" ${state.calendarFilterSource === "" ? "selected" : ""}>All Sources</option>
          <option value="LOCAL" ${state.calendarFilterSource === "LOCAL" ? "selected" : ""}>Walter Appointments</option>
          <option value="GOOGLE" ${state.calendarFilterSource === "GOOGLE" ? "selected" : ""}>Google Calendar Events</option>
        </select>
      </div>
    </div>

    ${calendarGridHtml}
    ${googleCalendarSimulatorModal()}
  `);
}

function conversationList(items = conversationService.list()) {
  if (items.length === 0) return emptyState("No Active Conversations", "Customer conversations will appear here once calls, emails, or messages are recorded.");
  return `<div class="list">${items.map((conversation) => `<div class="row">
    <span class="row-main"><span class="row-title">${conversation.customer}</span><span class="meta">${conversation.channel} - ${conversation.intent} - handled by ${conversation.handler}</span></span>
    <span class="badge ${badgeClass(conversation.status)}">${conversation.status}</span>
  </div>`).join("")}</div>`;
}

function activityList() {
  const appointments = appointmentService.listToday();
  const activityData = appointments.slice(0, 4).map((appointment) => [
    appointment.time,
    `${assistantName} has ${appointment.status} status for ${appointment.customer}`,
  ]);
  if (activityData.length === 0) return emptyState("No Recent Activity", "Actions from appointments and conversations will appear here.");
  return `<div class="list activity-list">${activityData.map(([time, text]) => `<div class="row"><span class="meta">${time}</span><span class="row-main"><span class="row-title">${text}</span></span></div>`).join("")}</div>`;
}

function conversationsPage(channel) {
  const title = channel || "Conversations";
  const filtered = channel ? conversationService.byChannel(channel) : conversationService.list();
  return shell(`<div class="page-head"><div class="page-copy"><p class="eyebrow">Unified Conversation Center</p><h1>${title}</h1><p>Each conversation shows customer intent, channel, handler, status, and the outcome ${assistantName} produced or escalated.</p></div><button class="btn">Transfer Selected To Human</button></div>
  <div class="grid two-col">
    <section class="panel"><div class="panel-head"><div><h2>Inbox</h2><p class="meta">${filtered.length} conversations in view.</p></div></div>${conversationList(filtered)}</section>
    <section class="panel"><div class="panel-head"><div><h2>Conversation Detail</h2><p class="meta">Select a conversation to review transcript context.</p></div></div><div class="detail-stack">
      <p><strong>Intent:</strong> ${filtered[0]?.intent || "No conversation selected"}</p>
      <p><strong>Result:</strong> ${filtered[0]?.result || "Conversation outcomes will appear here."}</p>
      <p><strong>Customer:</strong> ${filtered[0]?.customer || "None selected"}</p>
      <button class="btn">Review transcript</button>
    </div></section>
  </div>`);
}

function callsPage() {
  const latestCall = callService.latest();
  return shell(`<div class="page-head"><div class="page-copy"><p class="eyebrow">Phone Call History</p><h1>AI Phone Calls</h1><p>Call outcomes make it clear what ${assistantName} actually did during each phone interaction.</p></div><span class="badge success">${assistantName} Answering Calls</span></div>
  <div class="grid two-col">
    <section class="panel">${conversationList(conversationService.byChannel("Phone"))}</section>
    <section class="panel"><div class="panel-head"><div><h2>Call Detail</h2><p class="meta">Duration ${latestCall?.duration || "00:00"}</p></div></div><div class="detail-stack">
      <p><strong>Customer:</strong> ${latestCall?.customer || "No call selected"}</p>
      <p><strong>Status:</strong> ${latestCall ? "Completed" : "No calls recorded"}</p>
      <p><strong>Appointment action:</strong> ${latestCall?.result || "Call outcomes will appear here."}</p>
      <p><strong>AI summary:</strong> ${latestCall ? `${assistantName} handled the call and saved the result to this account.` : "Connect phone calls to review summaries from real customer interactions."}</p>
      <div class="actions"><button class="btn">Recording</button><button class="btn">Transfer Status</button></div>
    </div></section>
  </div>`);
}

function customersPage() {
  const list = customerService.list();
  const rows = list.map((customer) => `<tr data-action="edit-customer" data-id="${customer.id}"><td>${escapeHtml(customer.name)}</td><td>${escapeHtml(customer.email || "Not added")}</td><td>${escapeHtml(customer.phone || "Not added")}</td><td><span class="badge">${escapeHtml(customer.segment)}</span></td><td>${escapeHtml(customer.notes || "No notes yet")}</td></tr>`).join("");
  const mobileRows = list.map((customer) => `<button class="row" data-action="edit-customer" data-id="${customer.id}"><span class="row-main"><span class="row-title">${escapeHtml(customer.name)}</span><span class="meta">${escapeHtml(customer.phone || customer.email || "No contact details")} - ${escapeHtml(customer.notes || "No notes yet")}</span></span><span class="badge">${escapeHtml(customer.segment)}</span></button>`).join("");
  return shell(`<div class="page-head"><div class="page-copy"><p class="eyebrow">Customer Records</p><h1>Customers</h1><p>Edit names, contact details, segment, and notes without leaving the live account workspace.</p></div><button class="btn primary" data-action="customer">Add Customer</button></div>
  ${list.length === 0 ? emptyState("No Customers Yet", "Add the first customer to start booking appointments with real backend records.") : `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Segment</th><th>Next Action</th></tr></thead><tbody>${rows}</tbody></table><div class="mobile-list">${mobileRows}</div></div>`}
  ${customerForm()}`);
}

function customerForm() {
  if (!customerEditor) return "";
  const isEditing = customerEditor !== "new";
  const customer = isEditing ? customerService.getById(customerEditor) : null;
  return `<div class="modal-backdrop open" role="dialog" aria-modal="true">
    <form class="modal-panel auth-form" id="customer-form-el">
      <div class="page-head compact"><div class="page-copy"><p class="eyebrow">${isEditing ? "Edit Customer" : "New Customer"}</p><h2>${isEditing ? "Update Customer" : "Add Customer"}</h2></div><button class="btn" type="button" data-action="close-customer">Close</button></div>
      <label>Full Name<input class="input" id="customer-name" value="${escapeHtml(customer?.name || "")}" autocomplete="name" required></label>
      <label>Email<input class="input" id="customer-email" type="email" value="${escapeHtml(customer?.email || "")}" autocomplete="email"></label>
      <label>Phone<input class="input" id="customer-phone" value="${escapeHtml(customer?.phone || "")}" autocomplete="tel"></label>
      <label>Segment<select class="select" id="customer-segment">${["Standard", "High value", "Needs confirmation", "No-show risk", "New lead"].map((segment) => `<option ${segment === (customer?.segment || "Standard") ? "selected" : ""}>${segment}</option>`).join("")}</select></label>
      <label>Notes<textarea class="input textarea" id="customer-notes">${escapeHtml(customer?.notes || "")}</textarea></label>
      <div class="form-error" id="customer-error" hidden></div>
      <button class="btn primary" type="submit">${isEditing ? "Save Customer" : "Create Customer"}</button>
    </form>
  </div>`;
}

function settingsPage(label) {
  return shell(`<div class="page-head"><div class="page-copy"><p class="eyebrow">Business Settings</p><h1>${label}</h1><p>Keep account identity, timezone, public contact details, and receptionist defaults aligned with the way your business operates.</p></div><button class="btn primary" data-action="save">Save Changes</button></div>
  <div class="grid two-col">
    <section class="panel"><div class="panel-head"><div><h2>Business Profile</h2><p class="meta">Public-facing details used in confirmations and customer messages.</p></div></div><div class="auth-form">
      <label>Business Name<input class="input" value="${escapeHtml(currentUser?.businessName || "Your Business")}"></label>
      <label>Timezone<select class="select"><option>America/New_York</option><option>America/Chicago</option><option>America/Denver</option><option>America/Los_Angeles</option></select></label>
      <label>Reply Signature<input class="input" value="${escapeHtml(assistantName)} from ${escapeHtml(currentUser?.businessName || "your team")}"></label>
    </div></section>
    <section class="panel"><div class="panel-head"><div><h2>Workspace Controls</h2><p class="meta">Operational defaults that affect scheduling behavior.</p></div></div><div class="setting-list">
      ${settingRow("Appointment Holds", "Hold open slots while a customer confirms", "Enabled")}
      ${settingRow("Cancellation Window", "Require staff review for same-day cancellations", "Staff Review")}
      ${settingRow("Audit History", "Track every booking, status change, and customer edit", "Active")}
    </div></section>
  </div>`);
}

function servicesPage() {
  const services = serviceCatalog.list();
  return shell(`<div class="page-head"><div class="page-copy"><p class="eyebrow">Service Catalog</p><h1>Services</h1><p>Define bookable appointments with duration, buffer time, pricing, and active status.</p></div><button class="btn primary" data-action="save">Add Service</button></div>
  ${services.length === 0 ? emptyState("No Services Yet", "Add services before customers can book appointments.") : `<div class="grid three-col">${services.map((service) => `<article class="card service-card"><div class="card-top"><h3>${escapeHtml(service.name)}</h3><span class="badge ${service.active ? "success" : ""}">${service.active ? "Active" : "Paused"}</span></div><p>${escapeHtml(service.description)}</p><div class="setting-list compact-list">${settingRow("Duration", service.duration, service.price)}${settingRow("Buffer", service.buffer, "Protected")}</div></article>`).join("")}</div>`}`);
}

function staffPage() {
  const staff = staffDirectory.list();
  return shell(`<div class="page-head"><div class="page-copy"><p class="eyebrow">Team Routing</p><h1>Staff</h1><p>Manage who receives appointments, which profiles are active, and how staff contact details appear in scheduling workflows.</p></div><button class="btn primary" data-action="save">Invite Staff</button></div>
  ${staff.length === 0 ? emptyState("No Staff Yet", "Invite team members or create staff profiles for appointment assignment.") : `<div class="grid three-col">${staff.map((person) => `<article class="card staff-card"><div class="avatar">${escapeHtml(person.name.split(" ").map((part) => part[0]).join("").slice(0, 2))}</div><h3>${escapeHtml(person.name)}</h3><p>${escapeHtml(person.title)}</p><div class="setting-list compact-list">${settingRow("Email", person.email, person.active ? "Active" : "Paused")}${settingRow("Phone", person.phone, "Routing")}</div></article>`).join("")}</div>`}`);
}

function automationPage() {
  const rules = [
    ["Confirmation Chase", "Send a reminder when an appointment is still pending 24 hours before start time.", "Ready"],
    ["No-Show Watch", "Flag customers with repeated missed appointments for staff review.", "Monitoring"],
    ["Human Escalation", "Move pricing disputes, medical questions, and unclear requests out of automation.", "Protected"],
  ];
  return shell(`<div class="page-head"><div class="page-copy"><p class="eyebrow">Automation Rules</p><h1>Automation Rules</h1><p>Control where ${assistantName} acts automatically and where your team stays in the loop.</p></div><button class="btn primary" data-action="save">New Rule</button></div>
  <div class="grid three-col">${rules.map(([name, detail, status]) => `<article class="card"><div class="card-top"><h3>${name}</h3><span class="badge success">${status}</span></div><p>${detail}</p><div class="rule-flow"><span>Trigger</span><span>Condition</span><span>Action</span></div></article>`).join("")}</div>`);
}

function assistantPage() {
  return shell(`<div class="page-head"><div class="page-copy"><p class="eyebrow">Assistant Behavior</p><h1>AI Assistant Settings</h1><p>Tune ${assistantName}'s identity, booking permissions, escalation style, and customer-facing tone.</p></div><button class="btn primary" data-action="save">Save Assistant</button></div>
  <div class="grid two-col">
    <section class="panel"><div class="panel-head"><div><h2>${escapeHtml(assistantName)} Profile</h2><p class="meta">The name and tone customers experience across calls and messages.</p></div></div><div class="auth-form">
      <label>Assistant Name<input class="input" value="${escapeHtml(assistantName)}"></label>
      <label>Tone<select class="select"><option>Warm and efficient</option><option>Formal and concise</option><option>Friendly and conversational</option></select></label>
      <label>Booking Permission<select class="select"><option>Book, reschedule, and cancel within policy</option><option>Only suggest available times</option><option>Escalate all schedule changes</option></select></label>
    </div></section>
    <section class="panel"><div class="panel-head"><div><h2>Escalation Boundaries</h2><p class="meta">Clear limits keep the product trustworthy.</p></div></div><div class="setting-list">
      ${settingRow("Pricing Questions", "Send to staff when pricing is ambiguous", "Escalate")}
      ${settingRow("Double Booking", "Never override backend availability checks", "Blocked")}
      ${settingRow("Customer Identity", "Confirm the person before changing an appointment", "Required")}
    </div></section>
  </div>`);
}

function integrationsPage() {
  const gcal = state.googleCalendarIntegration || { enabled: false, config: {} };
  return shell(`<div class="page-head"><div class="page-copy"><p class="eyebrow">Connected Channels</p><h1>Integrations</h1><p>Connect Google Calendar and other channels to unify your appointment workflows.</p></div></div>
  <div class="grid two-col">
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Google Calendar Integration</h2>
          <p class="meta">Synchronize staff busy times and appointments automatically.</p>
        </div>
        <span class="badge ${gcal.enabled ? 'success' : 'warning'}">${gcal.enabled ? 'Enabled' : 'Disabled'}</span>
      </div>
      <form class="auth-form" id="google-calendar-config-form" style="margin-top:1.5rem;">
        <label class="row" style="display:flex; align-items:center; gap:0.5rem; margin-bottom:1rem; cursor:pointer;">
          <input type="checkbox" id="gcal-enabled" ${gcal.enabled ? 'checked' : ''} style="width:auto; margin:0;">
          <span><strong>Enable Google Calendar Sync</strong></span>
        </label>
        <label>Google Calendar ID
          <input class="input" id="gcal-calendar-id" value="${escapeHtml(gcal.config?.googleCalendarId || '')}" placeholder="e.g. primary or standard Gmail email" required>
          <span class="helper">Enter your primary Gmail email address, or the specific Google Calendar ID.</span>
        </label>
        <label>Google Service Account Email
          <input class="input" id="gcal-client-email" value="${escapeHtml(gcal.config?.googleServiceAccountEmail || '')}" placeholder="e.g. walter-ai@receptionist.iam.gserviceaccount.com">
          <span class="helper">Or leave blank to use the shared system Service Account.</span>
        </label>
        <label>Service Account Private Key (JSON / PEM format)
          <textarea class="input textarea" id="gcal-private-key" placeholder="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----" style="height:120px; font-family:monospace; font-size:0.8rem;">${escapeHtml(gcal.config?.googlePrivateKey || '')}</textarea>
          <span class="helper">If using the shared Service Account, share your Google Calendar with <code>walter-ai@walter-ai-receptionist.iam.gserviceaccount.com</code> and leave these fields blank!</span>
        </label>
        <div style="display:flex; gap:1rem; margin-top:1.5rem;">
          <button class="btn primary" type="submit">Save Settings</button>
          <button class="btn secondary" type="button" id="gcal-manual-sync-btn">🔄 Sync Now</button>
        </div>
      </form>
    </section>
    
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Setup Instructions</h2>
          <p class="meta">How to link your Google Calendar for free (Link-Free OAuth)</p>
        </div>
      </div>
      <div style="margin-top:1.5rem; display:flex; flex-direction:column; gap:1rem; font-size:0.9rem;">
        <div style="padding:1rem; background:rgba(0,0,0,0.03); border-radius:var(--radius); line-height:1.4;">
          <strong>Method 1: Zero-Config Shared Account (easiest & recommended)</strong>
          <ol style="margin-top:0.5rem; padding-left:1.25rem; display:flex; flex-direction:column; gap:0.25rem;">
            <li>Go to your <a href="https://calendar.google.com" target="_blank" style="text-decoration:underline;">Google Calendar</a>.</li>
            <li>In settings under "Settings for my calendars", click your calendar and choose "Share with specific people or groups".</li>
            <li>Add our system service email: <code>walter-ai@walter-ai-receptionist.iam.gserviceaccount.com</code> (give it Permission: "Make changes to events").</li>
            <li>Paste your main Gmail email address in the "Google Calendar ID" box on the left, check "Enable", and click Save.</li>
          </ol>
        </div>
        <div style="padding:1rem; background:rgba(0,0,0,0.03); border-radius:var(--radius); line-height:1.4;">
          <strong>Method 2: Custom Service Account Key (private isolation)</strong>
          <p style="margin-top:0.5rem;">If you prefer to run your own credentials, create a service account in Google Cloud Console, download the JSON key file, and copy-paste the client email and private key in the fields on the left.</p>
        </div>
      </div>
    </section>
  </div>`);
}

function billingPage() {
  return shell(`<div class="page-head"><div class="page-copy"><p class="eyebrow">Plan And Usage</p><h1>Billing</h1><p>Track subscription status, receptionist usage, and billing controls for this workspace.</p></div><button class="btn primary" data-action="save">Manage Plan</button></div>
  <div class="grid two-col">
    <section class="panel"><div class="panel-head"><div><h2>Current Plan</h2><p class="meta">Workspace billing summary.</p></div><span class="badge warning">Setup Needed</span></div><div class="metric-strip billing-metrics">${metric("Starter", "Plan")}${metric("$0", "Current balance")}</div></section>
    <section class="panel"><div class="panel-head"><div><h2>Usage Controls</h2><p class="meta">Protect costs while call volume grows.</p></div></div><div class="setting-list">
      ${settingRow("Monthly Call Limit", "Set a cap before overage billing begins", "Unset")}
      ${settingRow("SMS Reminders", "Bill only when reminders are enabled", "Available")}
      ${settingRow("Invoice Contact", currentUser?.email || "No billing email", "Owner")}
    </div></section>
  </div>`);
}

function settingRow(label, detail, status) {
  return `<div class="setting-row"><span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(detail)}</small></span><span class="badge">${escapeHtml(status)}</span></div>`;
}

function analyticsPage() {
  const data = state.analytics || { bookingSuccessRate: "0%", avgResponseTimeSaved: "0m", escalationsCount: 0, customerRating: "N/A" };
  return shell(`<div class="page-head"><div class="page-copy"><p class="eyebrow">Operational Reporting</p><h1>Analytics</h1><p>Outcome-oriented reporting for bookings, escalations, response time, and customer satisfaction.</p></div></div>
  <div class="metric-strip">${metric(data.bookingSuccessRate, "Booking success")}${metric(data.avgResponseTimeSaved, "Avg response saved")}${metric(data.escalationsCount, "Escalations")}${metric(data.customerRating, "Customer rating")}</div>
  <section class="panel"><h2>Conversation outcomes</h2><p>Resolved appointment requests, confirmations, cancellations, and escalations recorded in database history.</p></section>`);
}

function drawer() {
  const appointment = appointmentService.getById(drawerAppointment);
  const googleEvent = state.calendarEvents.find(evt => evt.id === drawerAppointment && evt.source === 'GOOGLE');
  
  const isOpen = !!appointment || !!googleEvent;
  
  return `<div class="drawer ${isOpen ? "open" : ""}" role="dialog" aria-modal="true">
    <aside class="drawer-panel">
      ${appointment ? `<div class="page-head"><div class="page-copy"><p class="eyebrow">Appointment details</p><h2>${appointment.customer}</h2></div><button class="btn" data-action="close">Close</button></div>
      <div class="detail-stack">
        <p><strong>Service:</strong> ${appointment.service}</p>
        <p><strong>Time:</strong> ${appointment.date}, ${appointment.time}, ${appointment.duration}</p>
        <p><strong>Staff:</strong> ${appointment.staff}</p>
        <p><strong>Booked through:</strong> ${appointment.channel}</p>
        <p><strong>Status:</strong> <span class="badge ${badgeClass(appointment.status)}">${appointment.status}</span></p>
        ${appointment.appointment?.googleCalendarEventId ? `<p><strong>Google Calendar Sync:</strong> <span class="badge success">SYNCHRONIZED</span> (ID: <code>${appointment.appointment.googleCalendarEventId}</code>)</p>` : ''}
        <div class="actions">
          <button class="btn primary" data-action="confirm-appt" data-id="${appointment.id}">Confirm</button>
          <button class="btn" data-action="reschedule-appt" data-id="${appointment.id}">Reschedule</button>
          <button class="btn danger" data-action="cancel-appt" data-id="${appointment.id}">Cancel</button>
          <button class="btn" data-action="close">Close</button>
        </div>
      </div>` : ''}
      
      ${googleEvent ? `<div class="page-head"><div class="page-copy"><p class="eyebrow">Google Calendar Event</p><h2>${escapeHtml(googleEvent.title)}</h2></div><button class="btn" data-action="close">Close</button></div>
      <div class="detail-stack">
        <p><strong>Description:</strong> ${escapeHtml(googleEvent.description || 'No description provided')}</p>
        <p><strong>Start:</strong> ${new Date(googleEvent.startTime).toLocaleString("en-US")}</p>
        <p><strong>End:</strong> ${new Date(googleEvent.endTime).toLocaleString("en-US")}</p>
        <p><strong>Source:</strong> <span class="badge success">Google Calendar (External)</span></p>
        <div class="alert-info" style="margin-top: 1rem; padding: 0.75rem; border-radius: var(--radius); background: rgba(0,128,0,0.1); color: green; font-size: 0.85rem;">
          This event is synchronized from your real Google Calendar and blocks booking slots in Walter.
        </div>
        <div class="actions" style="margin-top: 1.5rem;">
          <button class="btn" data-action="close">Close</button>
        </div>
      </div>` : ''}
    </aside>
  </div>`;
}

function pageForRoute() {
  if (currentRoute === "landing") return landing();
  if (currentRoute === "pricing") return `<main class="landing">${publicNav()}${pricingSection()}</main>`;
  if (currentRoute === "login" || currentRoute === "signup") return authPage(currentRoute);
  if (!currentToken) return authPage("login"); // Guard protected routes

  if (currentRoute === "overview") return overview();
  if (currentRoute === "appointments") return appointmentsPage();
  if (currentRoute === "calendar") return calendarPage();
  if (currentRoute === "customers") return customersPage();
  if (currentRoute === "conversations") return conversationsPage();
  if (currentRoute === "calls") return callsPage();
  if (currentRoute === "whatsapp") return conversationsPage("WhatsApp");
  if (currentRoute === "email") return conversationsPage("Email");
  if (currentRoute === "services") return servicesPage();
  if (currentRoute === "staff") return staffPage();
  if (currentRoute === "automation") return automationPage();
  if (currentRoute === "analytics") return analyticsPage();
  if (currentRoute === "assistant") return assistantPage();
  if (currentRoute === "integrations") return integrationsPage();
  if (currentRoute === "billing") return billingPage();
  const route = routes.find(([id]) => id === currentRoute);
  return settingsPage(route ? route[1] : "Overview");
}

function attachFormListeners() {
  const authForm = document.getElementById("auth-form-el");
  if (authForm) {
    authForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const isLogin = currentRoute === "login";
      const email = document.getElementById("auth-email").value;
      const password = document.getElementById("auth-password").value;
      const errorDiv = document.getElementById("auth-error");

      try {
        let res;
        if (isLogin) {
          res = await apiCall("/auth/login", "POST", { email, password });
        } else {
          const businessName = document.getElementById("auth-biz-name").value;
          const assistantNameVal = document.getElementById("auth-assistant-name").value;
          res = await apiCall("/auth/register", "POST", { businessName, email, password, assistantName: assistantNameVal });
        }

        currentToken = res.token;
        currentUser = res.user;
        localStorage.setItem("auth_token", res.token);
        showToast(`Successfully logged in as ${res.user.email}`);
        await stateManager.loadAll();
        navigate("overview");
      } catch (err) {
        errorDiv.hidden = false;
        errorDiv.textContent = err.message || "Authentication failed.";
      }
    });
  }

  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("auth_token");
      currentToken = null;
      currentUser = null;
      showToast("Logged out successfully");
      navigate("landing");
    });
  }

  const customerFormEl = document.getElementById("customer-form-el");
  if (customerFormEl) {
    customerFormEl.addEventListener("submit", async (e) => {
      e.preventDefault();
      const errorDiv = document.getElementById("customer-error");
      const payload = {
        name: document.getElementById("customer-name").value.trim(),
        email: document.getElementById("customer-email").value.trim() || null,
        phone: document.getElementById("customer-phone").value.trim() || null,
        segment: document.getElementById("customer-segment").value,
        notes: document.getElementById("customer-notes").value.trim() || null,
      };

      try {
        if (customerEditor === "new") {
          await customerService.create(payload);
          showToast(`${payload.name} was added.`);
        } else {
          await customerService.update(customerEditor, payload);
          showToast(`${payload.name} was updated.`);
        }
        customerEditor = null;
        render();
      } catch (err) {
        errorDiv.hidden = false;
        errorDiv.textContent = err.message || "Customer could not be saved.";
      }
    });
  }

  const gcalConfigForm = document.getElementById("google-calendar-config-form");
  if (gcalConfigForm) {
    gcalConfigForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const enabled = document.getElementById("gcal-enabled").checked;
      const googleCalendarId = document.getElementById("gcal-calendar-id").value.trim();
      const googleServiceAccountEmail = document.getElementById("gcal-client-email").value.trim();
      const googlePrivateKey = document.getElementById("gcal-private-key").value.trim();

      try {
        await apiCall("/integrations/google-calendar", "POST", {
          enabled,
          googleCalendarId,
          googleServiceAccountEmail,
          googlePrivateKey,
        });
        showToast("Google Calendar integration saved!");
        await stateManager.loadAll();
      } catch (err) {
        showToast(err.message || "Failed to save Google Calendar config.");
      }
    });
  }

  const manualSyncBtn = document.getElementById("gcal-manual-sync-btn");
  if (manualSyncBtn) {
    manualSyncBtn.addEventListener("click", async () => {
      showToast("Syncing Google Calendar...");
      try {
        const res = await apiCall("/integrations/google-calendar/sync", "POST");
        showToast(res.message || "Google Calendar sync complete!");
        await stateManager.loadAll();
      } catch (err) {
        showToast("Sync failed: " + err.message);
      }
    });
  }

  const gcalSimForm = document.getElementById("gcal-simulator-form-el");
  if (gcalSimForm) {
    gcalSimForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const errorDiv = document.getElementById("sim-event-error");
      const payload = {
        summary: document.getElementById("sim-event-summary").value.trim(),
        description: document.getElementById("sim-event-desc").value.trim(),
        startTime: document.getElementById("sim-event-start").value,
        endTime: document.getElementById("sim-event-end").value,
      };

      try {
        await apiCall("/integrations/google-calendar/simulator-event", "POST", payload);
        showToast("Simulated Google event created!");
        state.gcalSimulatorOpen = false;
        await stateManager.loadAll();
      } catch (err) {
        errorDiv.hidden = false;
        errorDiv.textContent = err.message || "Failed to create simulated event.";
      }
    });
  }
}

async function render() {
  app.innerHTML = pageForRoute();
  attachFormListeners();

  document.querySelectorAll("[data-route]").forEach((element) => element.addEventListener("click", () => navigate(element.dataset.route)));
  document.querySelectorAll("[data-open-appt]").forEach((element) => element.addEventListener("click", () => {
    drawerAppointment = element.dataset.openAppt;
    render();
  }));

  document.querySelectorAll("[data-action]").forEach((element) => element.addEventListener("click", async () => {
    const action = element.dataset.action;
    const apptId = element.dataset.id || drawerAppointment;

    if (action === "close") {
      drawerAppointment = null;
      render();
      return;
    }

    if (action === "close-customer") {
      customerEditor = null;
      render();
      return;
    }

    if (action === "customer") {
      currentRoute = "customers";
      location.hash = "/customers";
      customerEditor = "new";
      render();
      return;
    }

    if (action === "edit-customer") {
      customerEditor = element.dataset.id;
      render();
      return;
    }

    if (action === "confirm-appt" && apptId) {
      try {
        await appointmentService.confirm(apptId);
        showToast("Appointment confirmed!");
      } catch (e) { showToast(e.message); }
      return;
    }

    if (action === "cancel-appt" && apptId) {
      if (!confirm("Cancel this appointment?")) return;
      try {
        await appointmentService.cancel(apptId);
        drawerAppointment = null;
        showToast("Appointment cancelled.");
      } catch (e) { showToast(e.message); }
      return;
    }

    if (action === "reschedule-appt" && apptId) {
      const newTime = prompt("Enter new date & time (e.g. 2026-08-17T15:30:00.000Z):", new Date().toISOString());
      if (newTime) {
        try {
          await appointmentService.reschedule(apptId, newTime);
          showToast("Appointment rescheduled!");
        } catch (e) { showToast(e.message); }
      }
      return;
    }

    if (action === "book") {
      const custName = prompt("Customer Name:");
      if (!custName) return;
      try {
        const custs = await apiCall("/customers");
        const srvs = await apiCall("/services");
        const stff = await apiCall("/staff");

        const normalizedName = custName.trim();
        const targetCust = custs.find((customer) => customer.name.toLowerCase() === normalizedName.toLowerCase()) ||
          (await apiCall("/customers", "POST", { name: normalizedName, segment: "New lead" }));
        const targetSrv = srvs[0];
        const targetStff = stff[0];

        if (!targetSrv) throw new Error("Create a service before booking appointments.");

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(10, 0, 0, 0);

        await appointmentService.book({
          customerId: targetCust.id,
          serviceId: targetSrv.id,
          staffId: targetStff?.id,
          startTime: tomorrow.toISOString(),
          channel: "web",
          notes: "Booked from dashboard button",
        });

        showToast("New appointment booked!");
      } catch (e) {
        showToast(e.message || "Failed to book appointment");
      }
      return;
    }

    showToast(notificationService.messageFor(action));
  }));

  // Calendar View Toggles
  const viewDayBtn = document.getElementById("view-day-btn");
  if (viewDayBtn) viewDayBtn.addEventListener("click", () => { state.calendarView = "day"; render(); });
  const viewWeekBtn = document.getElementById("view-week-btn");
  if (viewWeekBtn) viewWeekBtn.addEventListener("click", () => { state.calendarView = "week"; render(); });
  const viewMonthBtn = document.getElementById("view-month-btn");
  if (viewMonthBtn) viewMonthBtn.addEventListener("click", () => { state.calendarView = "month"; render(); });

  // Calendar Simulator toggle
  const openGcalSimBtn = document.getElementById("open-gcal-simulator-btn");
  if (openGcalSimBtn) openGcalSimBtn.addEventListener("click", () => { state.gcalSimulatorOpen = true; render(); });
  const closeGcalSimBtn = document.getElementById("close-gcal-simulator-btn");
  if (closeGcalSimBtn) closeGcalSimBtn.addEventListener("click", () => { state.gcalSimulatorOpen = false; render(); });


  // Calendar Nav controls
  const calPrevBtn = document.getElementById("cal-prev-btn");
  if (calPrevBtn) calPrevBtn.addEventListener("click", async () => {
    const d = state.calendarDate;
    if (state.calendarView === "month") d.setMonth(d.getMonth() - 1);
    else if (state.calendarView === "week") d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 1);
    await fetchCalendarEvents();
    render();
  });
  const calTodayBtn = document.getElementById("cal-today-btn");
  if (calTodayBtn) calTodayBtn.addEventListener("click", async () => {
    state.calendarDate = new Date("2026-08-23T12:00:00");
    await fetchCalendarEvents();
    render();
  });
  const calNextBtn = document.getElementById("cal-next-btn");
  if (calNextBtn) calNextBtn.addEventListener("click", async () => {
    const d = state.calendarDate;
    if (state.calendarView === "month") d.setMonth(d.getMonth() + 1);
    else if (state.calendarView === "week") d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
    await fetchCalendarEvents();
    render();
  });

  // Calendar filters
  const calFilterStaff = document.getElementById("cal-filter-staff");
  if (calFilterStaff) calFilterStaff.addEventListener("change", (e) => { state.calendarFilterStaff = e.target.value; render(); });
  const calFilterService = document.getElementById("cal-filter-service");
  if (calFilterService) calFilterService.addEventListener("change", (e) => { state.calendarFilterService = e.target.value; render(); });
  const calFilterSource = document.getElementById("cal-filter-source");
  if (calFilterSource) calFilterSource.addEventListener("change", (e) => { state.calendarFilterSource = e.target.value; render(); });

  // Quick book slots in Day/Week
  document.querySelectorAll("[data-action='quick-book-slot']").forEach(el => {
    el.addEventListener("click", async () => {
      const slotTime = el.dataset.slot;
      const srvs = await apiCall("/services");
      const stff = await apiCall("/staff");
      const custs = await apiCall("/customers");

      if (srvs.length === 0) {
        showToast("Create a service first before booking.");
        return;
      }

      const custName = prompt("Enter customer name to book at this slot:");
      if (!custName) return;

      try {
        const normalizedName = custName.trim();
        const targetCust = custs.find(c => c.name.toLowerCase() === normalizedName.toLowerCase()) ||
          await apiCall("/customers", "POST", { name: normalizedName, segment: "New lead" });
        
        await appointmentService.book({
          customerId: targetCust.id,
          serviceId: srvs[0].id,
          staffId: stff[0]?.id,
          startTime: slotTime,
          channel: "web",
          notes: "Quick booked from calendar cell",
        });

        showToast("Appointment booked!");
        await stateManager.loadAll();
      } catch (err) {
        showToast(err.message || "Booking failed");
      }
    });
  });

  // Time ticking clock widget
  if (currentRoute === "calendar") {
    startClock();
  }
}

let clockInterval = null;
function startClock() {
  const update = () => {
    const el = document.getElementById("realtime-clock");
    if (el) {
      const now = new Date();
      el.textContent = now.toLocaleTimeString("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }) + " EST";
    }
  };
  update();
  if (clockInterval) clearInterval(clockInterval);
  clockInterval = setInterval(update, 1000);
}

// Boot sequence: check session & load state
(async () => {
  await checkAuthSession();
  if (currentToken) {
    await stateManager.loadAll();
  } else {
    render();
  }
})();
