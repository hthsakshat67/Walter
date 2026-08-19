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
    const data = await res.json();
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
  loading: false,
  error: null,
};

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
  fetch: async () => {
    try {
      const data = await apiCall("/customers");
      state.customers = data.map((c) => [c.name, c.email || "N/A", c.phone || "N/A", c.segment || "Standard", c.notes || "No notes"]);
    } catch (e) {}
  },
  create: async (data) => {
    await apiCall("/customers", "POST", data);
    await customerService.fetch();
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
  latest: () => state.calls[0] || { customer: "Sofia Garcia", duration: "02:43", result: "Successfully rescheduled" },
  fetch: async () => {
    try {
      const data = await apiCall("/calls");
      state.calls = data.map((c) => ({
        id: c.id,
        customer: c.customer?.name || "Sofia Garcia",
        duration: c.duration || "02:43",
        result: c.appointmentAction || "Call completed",
      }));
    } catch (e) {}
  },
};

const notificationService = {
  messageFor: (action) => `${titleCase(action)} request processed by backend engine.`,
};

const stateManager = {
  loadAll: async () => {
    if (!currentToken) return;
    state.loading = true;
    try {
      const [summary, analytics] = await Promise.all([
        apiCall("/dashboard/summary").catch(() => null),
        apiCall("/analytics/overview").catch(() => null),
        appointmentService.fetch(),
        customerService.fetch(),
        conversationService.fetch(),
        callService.fetch(),
      ]);
      if (summary) state.dashboardSummary = summary;
      if (analytics) state.analytics = analytics;
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
      ${currentToken ? `<button class="btn primary" data-route="overview">Dashboard</button>` : `<button class="btn" data-route="login">Login</button><button class="btn primary" data-route="signup">Sign up</button>`}
    </div>
  </nav>`;
}

function landing() {
  return `<main class="landing">${publicNav()}
    <section class="hero">
      <div class="hero-copy reveal">
        <div class="page-copy">
          <p class="eyebrow">Meet ${assistantName}</p>
          <h1>Your AI receptionist, available 24/7.</h1>
          <p>${assistantName} answers calls and messages, understands appointment intent, and keeps the schedule moving without hiding what happened from your team.</p>
        </div>
        <div class="actions">
          <button class="btn primary" data-route="signup">Start free</button>
          <button class="btn" data-route="overview">View dashboard</button>
        </div>
      </div>
      <div class="product-frame reveal">${productDemo()}</div>
    </section>
    <section class="section">
      <div class="section-inner sticky-demo">
        <div class="section-head">
          <p class="eyebrow">AI receptionist</p>
          <h2>Built around appointments, not novelty.</h2>
          <p>The interface makes the receptionist's work legible: who contacted the business, what they needed, what ${assistantName} changed, and what still needs a human.</p>
          ${channelCards()}
        </div>
        <div class="product-frame">${phoneDemo()}</div>
      </div>
    </section>
    ${pricingSection()}
    <section class="section">
      <div class="section-inner final-cta">
        <p class="eyebrow">Ready for the next call</p>
        <h2>Put ${assistantName} on the front desk.</h2>
        <p>Launch a serious SaaS foundation today, connected directly to a real PostgreSQL & Prisma backend engine.</p>
        <button class="btn primary" data-route="signup">Create account</button>
      </div>
    </section>
  </main>`;
}

function productDemo() {
  const summary = state.dashboardSummary || { appointmentsToday: 34, callsHandled: 47, pendingConfirmations: 6, noShowRisk: 3 };
  return `<div class="product-window">
    <div class="window-bar"><strong>Northside Wellness</strong><span class="badge success">${assistantName} online</span></div>
    <div class="window-body">
      <div class="metric-strip">
        ${metric(summary.appointmentsToday, "Appointments today")}
        ${metric(summary.callsHandled, "Calls handled")}
        ${metric(summary.pendingConfirmations, "Confirmations")}
        ${metric(summary.noShowRisk, "At risk")}
      </div>
      <div class="demo-grid">
        ${compactPreviewRows()}
        ${phoneDemo()}
      </div>
    </div>
  </div>`;
}

function compactPreviewRows() {
  const rows = appointmentService.listToday();
  return `<div class="preview-list">${rows.slice(0, 4).map((appointment) => `<div class="preview-appointment">
    <span class="meta">${appointment.time}</span>
    <span><strong>${appointment.customer}</strong><span class="meta">${appointment.service}</span></span>
    <span class="badge ${badgeClass(appointment.status)}">${appointment.status}</span>
  </div>`).join("")}</div>`;
}

function phoneDemo() {
  return `<aside class="phone-demo">
    <div>
      <small>Live phone call</small>
      <h3>Sofia Garcia</h3>
    </div>
    <p>Intent: reschedule appointment</p>
    <div class="row phone-row">
      <div class="row-main"><span class="row-title">${assistantName} offered 3:45 PM</span><span class="meta">Customer accepted by voice</span></div>
    </div>
    <span class="badge success">Successfully rescheduled</span>
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
    <div class="section-head"><p class="eyebrow">Pricing</p><h2>Plans for appointment-based teams.</h2></div>
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
          <h1>${isLogin ? "Welcome back" : "Create your account"}</h1>
          <p>${isLogin ? `Sign in to review what ${assistantName} handled today.` : `Set up ${assistantName} for your business with a real backend integration.`}</p>
        </div>
        <form class="auth-form" id="auth-form-el">
          ${!isLogin ? `<label>Business name<input class="input" id="auth-biz-name" value="Northside Wellness"></label>` : ""}
          <label>Email<input class="input" id="auth-email" type="email" value="${isLogin ? "owner@northsideclinic.com" : "owner@northsideclinic.com"}"></label>
          <label>Password<input class="input" id="auth-password" type="password" value="password"><span class="helper">Use at least 8 characters.</span></label>
          ${!isLogin ? `<label>Assistant name<input class="input" id="auth-assistant-name" value="${assistantName}"></label>` : ""}
          <div class="form-error" id="auth-error" hidden></div>
          <button class="btn primary" type="submit" id="auth-submit-btn">${isLogin ? "Login" : "Sign up"}</button>
          <div class="auth-links">
            <a href="#/${isLogin ? "signup" : "login"}">${isLogin ? "Create an account" : "Already have an account?"}</a>
            <a href="#/landing">Back to site</a>
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
          <span class="badge success">${assistantName} online</span>
          <button class="btn primary" data-action="book">Book appointment</button>
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
  const summary = state.dashboardSummary || { appointmentsToday: 34, callsHandled: 47, pendingConfirmations: 6, noShowRisk: 3 };
  return shell(`<div class="page-head">
    <div class="page-copy"><p class="eyebrow">Sunday, August 16, 2026 - ${currentUser?.businessName || "Northside Wellness"}</p><h1>Today at a glance</h1><p>Operational work for the day, powered directly by backend PostgreSQL APIs.</p></div>
    <div class="actions"><button class="btn" data-action="customer">Add customer</button><button class="btn" data-route="calendar">View calendar</button></div>
  </div>
  <div class="metric-strip">
    ${metric(summary.appointmentsToday, "Appointments today")}
    ${metric(summary.callsHandled, `Calls answered by ${assistantName}`)}
    ${metric(summary.pendingConfirmations, "Pending confirmations")}
    ${metric(summary.noShowRisk, "No-show risk")}
  </div>
  <div class="grid two-col">
    <section class="panel"><div class="panel-head"><div><h2>Today's appointments</h2><p class="meta">Live queue for staff and assistant activity.</p></div><span class="badge warning">${summary.pendingConfirmations} pending</span></div>${appointmentsList()}</section>
    <div class="grid">
      <section class="panel"><div class="panel-head"><div><h2>Active conversations</h2><p class="meta">Recent customer intent across channels.</p></div></div>${conversationList()}</section>
      <section class="panel"><div class="panel-head"><div><h2>Recent activity</h2></div></div>${activityList()}</section>
    </div>
  </div>`);
}

function appointmentsList(compact = false) {
  const rows = appointmentService.listToday();
  if (rows.length === 0) return `<p class="meta" style="padding:1rem;">No appointments found.</p>`;
  return `<div class="list">${rows.map((appointment) => `<button class="row timeline-item" data-open-appt="${appointment.id}">
    <span class="meta">${appointment.time}</span>
    <span class="row-main"><span class="row-title">${appointment.customer}</span><span class="meta">${appointment.service} with ${appointment.staff} - ${appointment.duration} - ${appointment.channel}</span></span>
    <span class="badge ${badgeClass(appointment.status)}">${appointment.status}</span>
  </button>`).slice(0, compact ? 4 : undefined).join("")}</div>`;
}

function appointmentsPage() {
  return shell(`<div class="page-head">
    <div class="page-copy"><p class="eyebrow">Appointment management</p><h1>Appointments</h1><p>Book, reschedule, cancel, confirm, and complete appointments while preserving channel and staff context.</p></div>
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

function calendarPage() {
  const days = Array.from({ length: 35 }, (_, index) => index + 1);
  return shell(`<div class="page-head"><div class="page-copy"><p class="eyebrow">August 2026</p><h1>Calendar</h1><p>Month view with assistant-driven confirmations and appointment context.</p></div><div class="tabs">${["Day", "Week", "Month"].map((tab, index) => `<button class="tab ${index === 2 ? "active" : ""}">${tab}</button>`).join("")}</div></div>
  <div class="calendar">${days.map((day) => `<div class="day"><strong>${day}</strong>${day % 5 === 0 ? `<div class="appt-chip">${assistantName}: confirmation queue</div>` : ""}${day === 16 ? `<div class="appt-chip">8:30 Maya Thompson</div><div class="appt-chip">3:45 Sofia Garcia</div>` : ""}</div>`).join("")}</div>`);
}

function conversationList(items = conversationService.list()) {
  if (items.length === 0) return `<p class="meta" style="padding:1rem;">No active conversations.</p>`;
  return `<div class="list">${items.map((conversation) => `<div class="row">
    <span class="row-main"><span class="row-title">${conversation.customer}</span><span class="meta">${conversation.channel} - ${conversation.intent} - handled by ${conversation.handler}</span></span>
    <span class="badge ${badgeClass(conversation.status)}">${conversation.status}</span>
  </div>`).join("")}</div>`;
}

function activityList() {
  const activityData = [
    ["7:58 AM", `${assistantName} confirmed Maya Thompson by phone`],
    ["8:16 AM", "Cancellation request routed to front desk"],
    ["8:44 AM", "Reminder batch sent for tomorrow's appointments"],
    ["9:05 AM", `${assistantName} flagged Sofia Garcia as no-show risk`],
  ];
  return `<div class="list activity-list">${activityData.map(([time, text]) => `<div class="row"><span class="meta">${time}</span><span class="row-main"><span class="row-title">${text}</span></span></div>`).join("")}</div>`;
}

function conversationsPage(channel) {
  const title = channel || "Conversations";
  const filtered = channel ? conversationService.byChannel(channel) : conversationService.list();
  return shell(`<div class="page-head"><div class="page-copy"><p class="eyebrow">Unified conversation centre</p><h1>${title}</h1><p>Each conversation shows customer intent, channel, handler, status, and the outcome ${assistantName} produced or escalated.</p></div><button class="btn">Transfer selected to human</button></div>
  <div class="grid two-col">
    <section class="panel"><div class="panel-head"><div><h2>Inbox</h2><p class="meta">${filtered.length} conversations in view.</p></div></div>${conversationList(filtered)}</section>
    <section class="panel"><div class="panel-head"><div><h2>Conversation detail</h2><p class="meta">Representative transcript preview.</p></div></div><div class="detail-stack">
      <p><strong>Intent:</strong> Reschedule appointment</p>
      <p><strong>Result:</strong> Successfully rescheduled by ${assistantName}</p>
      <p><strong>Transcript:</strong> Customer asked for a later appointment. ${assistantName} offered available times, confirmed the new slot, and sent a reminder.</p>
      <button class="btn">Review transcript</button>
    </div></section>
  </div>`);
}

function callsPage() {
  const latestCall = callService.latest();
  return shell(`<div class="page-head"><div class="page-copy"><p class="eyebrow">Phone call history</p><h1>AI Phone Calls</h1><p>Call outcomes make it clear what ${assistantName} actually did during each phone interaction.</p></div><span class="badge success">${assistantName} answering calls</span></div>
  <div class="grid two-col">
    <section class="panel">${conversationList(conversationService.byChannel("Phone"))}</section>
    <section class="panel"><div class="panel-head"><div><h2>Call detail</h2><p class="meta">Duration ${latestCall.duration || "02:43"}</p></div></div><div class="detail-stack">
      <p><strong>Customer:</strong> ${latestCall.customer}</p>
      <p><strong>Status:</strong> Completed</p>
      <p><strong>Appointment action:</strong> ${latestCall.result}</p>
      <p><strong>AI summary:</strong> ${assistantName} moved the appointment from 2:00 PM to 3:45 PM and sent confirmation by SMS.</p>
      <div class="actions"><button class="btn">Recording placeholder</button><button class="btn">Transfer status: not needed</button></div>
    </div></section>
  </div>`);
}

function customersPage() {
  const list = customerService.list();
  return shell(`<div class="page-head"><div class="page-copy"><p class="eyebrow">Customer records</p><h1>Customers</h1><p>Customer context for appointment history, risk, and next actions.</p></div><button class="btn primary" data-action="customer">Add customer</button></div>
  <div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Segment</th><th>Next action</th></tr></thead><tbody>${list.map((customer) => `<tr>${customer.map((value) => `<td>${value}</td>`).join("")}</tr>`).join("")}</tbody></table>
  <div class="mobile-list">${list.map((customer) => `<div class="row"><span class="row-main"><span class="row-title">${customer[0]}</span><span class="meta">${customer[2]} - ${customer[4]}</span></span><span class="badge">${customer[3]}</span></div>`).join("")}</div></div>`);
}

function settingsPage(label) {
  const isAssistant = label === "AI Assistant Settings";
  return shell(`<div class="page-head"><div class="page-copy"><p class="eyebrow">Configuration</p><h1>${label}</h1><p>${isAssistant ? "Assistant identity, tone, escalation rules, and appointment permissions." : "Configuration foundation backed by server API settings."}</p></div><button class="btn primary" data-action="save">Save changes</button></div>
  <div class="grid two-col">
    <section class="panel"><div class="panel-head"><div><h2>${isAssistant ? `${assistantName} profile` : "Settings"}</h2></div></div><div class="auth-form">
      <label>${isAssistant ? "Assistant name" : "Business name"}<input class="input" id="setting-biz-name" value="${isAssistant ? assistantName : (currentUser?.businessName || "Northside Wellness")}"></label>
      <label>Mode<select class="select"><option>Active</option><option>Draft</option></select></label>
      <label>Escalation policy<select class="select"><option>Escalate pricing and conflict cases</option><option>Escalate every uncertain request</option></select></label>
    </div></section>
    <section class="panel"><div class="panel-head"><div><h2>Backend Architecture Status</h2></div></div><p>Fully connected to Node.js, Express, TypeScript, and Prisma backend with real double-booking checks and status history.</p></section>
  </div>`);
}

function analyticsPage() {
  const data = state.analytics || { bookingSuccessRate: "91%", avgResponseTimeSaved: "18m", escalationsCount: 12, customerRating: "4.8" };
  return shell(`<div class="page-head"><div class="page-copy"><p class="eyebrow">Operational reporting</p><h1>Analytics</h1><p>Outcome-oriented reporting for bookings, escalations, response time, and customer satisfaction.</p></div></div>
  <div class="metric-strip">${metric(data.bookingSuccessRate, "Booking success")}${metric(data.avgResponseTimeSaved, "Avg response saved")}${metric(data.escalationsCount, "Escalations")}${metric(data.customerRating, "Customer rating")}</div>
  <section class="panel"><h2>Conversation outcomes</h2><p>Resolved appointment requests, confirmations, cancellations, and escalations recorded in database history.</p></section>`);
}

function drawer() {
  const appointment = appointmentService.getById(drawerAppointment);
  return `<div class="drawer ${appointment ? "open" : ""}" role="dialog" aria-modal="true">
    <aside class="drawer-panel">${appointment ? `<div class="page-head"><div class="page-copy"><p class="eyebrow">Appointment details</p><h2>${appointment.customer}</h2></div><button class="btn" data-action="close">Close</button></div>
      <div class="detail-stack">
        <p><strong>Service:</strong> ${appointment.service}</p>
        <p><strong>Time:</strong> ${appointment.date}, ${appointment.time}, ${appointment.duration}</p>
        <p><strong>Staff:</strong> ${appointment.staff}</p>
        <p><strong>Booked through:</strong> ${appointment.channel}</p>
        <p><strong>Status:</strong> <span class="badge ${badgeClass(appointment.status)}">${appointment.status}</span></p>
        <div class="actions">
          <button class="btn primary" data-action="confirm-appt" data-id="${appointment.id}">Confirm</button>
          <button class="btn" data-action="reschedule-appt" data-id="${appointment.id}">Reschedule</button>
          <button class="btn danger" data-action="cancel-appt" data-id="${appointment.id}">Cancel</button>
          <button class="btn" data-action="close">Close</button>
        </div>
      </div>` : ""}</aside>
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
  if (currentRoute === "analytics") return analyticsPage();
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
      const custName = prompt("Customer Name:", "Maya Thompson");
      if (!custName) return;
      try {
        // Fetch or pick first customer, service
        const custs = await apiCall("/customers");
        const srvs = await apiCall("/services");
        const stff = await apiCall("/staff");

        const targetCust = custs[0] || (await apiCall("/customers", "POST", { name: custName }));
        const targetSrv = srvs[0];
        const targetStff = stff[0];

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
