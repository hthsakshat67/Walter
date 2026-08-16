const assistantName = "Walter";

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

const appointmentData = [
  { id: 1, date: "Aug 16", time: "8:30 AM", duration: "45m", customer: "Maya Thompson", service: "New patient consultation", staff: "Dr. Elena Ruiz", status: "confirmed", channel: "phone" },
  { id: 2, date: "Aug 16", time: "9:30 AM", duration: "30m", customer: "Chris Bennett", service: "Follow-up visit", staff: "Dr. Noah Patel", status: "pending", channel: "WhatsApp" },
  { id: 3, date: "Aug 16", time: "11:00 AM", duration: "60m", customer: "Priya Shah", service: "Color consultation", staff: "Amara Lewis", status: "confirmed", channel: "web" },
  { id: 4, date: "Aug 16", time: "1:15 PM", duration: "30m", customer: "Jordan Lee", service: "Rescheduled check-in", staff: "Nina Brooks", status: "completed", channel: "email" },
  { id: 5, date: "Aug 16", time: "3:45 PM", duration: "45m", customer: "Sofia Garcia", service: "Initial intake", staff: "Dr. Elena Ruiz", status: "no-show risk", channel: "phone" },
];

const conversationData = [
  { customer: "Chris Bennett", channel: "WhatsApp", time: "10 min ago", intent: "Confirm appointment", status: "Awaiting customer", handler: assistantName, result: "Confirmation reminder sent" },
  { customer: "Sofia Garcia", channel: "Phone", time: "23 min ago", intent: "Reschedule appointment", status: "Resolved", handler: assistantName, result: "Successfully rescheduled", duration: "02:43" },
  { customer: "Marcus Green", channel: "Email", time: "41 min ago", intent: "Ask service price", status: "Human review", handler: "Front desk", result: "Pricing question escalated" },
  { customer: "Priya Shah", channel: "Web", time: "1 hr ago", intent: "Book appointment", status: "Resolved", handler: assistantName, result: "New booking created" },
];

const customerData = [
  ["Maya Thompson", "maya@example.com", "(312) 555-0189", "High value", "Next visit today"],
  ["Chris Bennett", "chris@example.com", "(646) 555-0132", "Needs confirmation", "Pending reply"],
  ["Sofia Garcia", "sofia@example.com", "(415) 555-0194", "No-show risk", "Follow-up queued"],
  ["Marcus Green", "marcus@example.com", "(617) 555-0148", "New lead", "Needs staff review"],
];

const activityData = [
  ["7:58 AM", `${assistantName} confirmed Maya Thompson by phone`],
  ["8:16 AM", "Cancellation request routed to front desk"],
  ["8:44 AM", "Reminder batch sent for tomorrow's appointments"],
  ["9:05 AM", `${assistantName} flagged Sofia Garcia as no-show risk`],
];

const appointmentService = {
  listToday: () => appointmentData,
  getById: (id) => appointmentData.find((appointment) => appointment.id === id),
};
const customerService = { list: () => customerData };
const conversationService = {
  list: () => conversationData,
  byChannel: (channel) => conversationData.filter((item) => item.channel.toLowerCase() === channel.toLowerCase()),
};
const callService = { latest: () => conversationData.find((item) => item.channel === "Phone") };
const notificationService = { messageFor: (action) => `${titleCase(action)} action recorded in frontend state.` };

const app = document.querySelector("#app");
let currentRoute = location.hash.replace("#/", "") || "landing";
let drawerAppointment = null;
let toastTimer;

function titleCase(value) {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

function badgeClass(status) {
  const value = status.toLowerCase();
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
      <button class="btn" data-route="login">Login</button>
      <button class="btn primary" data-route="signup">Sign up</button>
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
    <section class="section">
      <div class="section-inner">
        <div class="section-head">
          <p class="eyebrow">Appointment automation</p>
          <h2>Book, reschedule, cancel, and confirm from one operating rhythm.</h2>
          <p>Phone calls, WhatsApp replies, emails, and web requests end in the same schedule workflow, with clean status trails for every appointment.</p>
        </div>
        <div class="grid four-col">
          ${["Booking", "Rescheduling", "Cancellation", "Confirmation"].map((title) => `<article class="card"><h3>${title}</h3><p>Clear customer context, staff assignment, channel source, and next action.</p></article>`).join("")}
        </div>
      </div>
    </section>
    <section class="section">
      <div class="section-inner grid two-col">
        <div class="section-head">
          <p class="eyebrow">Unified dashboard</p>
          <h2>Operational, calm, and ready for real integrations.</h2>
          <p>The frontend keeps mock data behind service boundaries so calendar, voice, WhatsApp, email, and CRM APIs can replace it later without redesigning the product.</p>
          <button class="btn primary" data-route="overview">Open dashboard</button>
        </div>
        <div class="panel">${appointmentsList(true)}</div>
      </div>
    </section>
    <section class="section">
      <div class="section-inner grid three-col">
        ${["Analytics", "Conversation history", "Reliability"].map((title) => `<article class="card"><h3>${title}</h3><p>Track outcomes, review transcripts, and expose escalation status without pretending the backend is complete.</p></article>`).join("")}
      </div>
    </section>
    ${pricingSection()}
    <section class="section">
      <div class="section-inner final-cta">
        <p class="eyebrow">Ready for the next call</p>
        <h2>Put ${assistantName} on the front desk.</h2>
        <p>Launch a serious SaaS foundation today, then connect production automation services when the backend is ready.</p>
        <button class="btn primary" data-route="signup">Create account</button>
      </div>
    </section>
  </main>`;
}

function productDemo() {
  return `<div class="product-window">
    <div class="window-bar"><strong>Northside Wellness</strong><span class="badge success">${assistantName} online</span></div>
    <div class="window-body">
      <div class="metric-strip">
        ${metric("34", "Appointments today")}
        ${metric("47", "Calls handled")}
        ${metric("6", "Confirmations")}
        ${metric("3", "At risk")}
      </div>
      <div class="demo-grid">
        ${compactPreviewRows()}
        ${phoneDemo()}
      </div>
    </div>
  </div>`;
}

function compactPreviewRows() {
  return `<div class="preview-list">${appointmentService.listToday().slice(0, 4).map((appointment) => `<div class="preview-appointment">
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
        <br><button class="btn ${index === 1 ? "primary" : ""}">Choose ${plan[0]}</button>
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
          <p>${isLogin ? `Sign in to review what ${assistantName} handled today.` : `Set up ${assistantName} for your business with a clean appointment workspace.`}</p>
        </div>
        <form class="auth-form">
          ${!isLogin ? field("Business name", "Northside Wellness") : ""}
          ${field("Email", "owner@northsideclinic.com", "email")}
          ${field("Password", "password", "password", isLogin ? "" : "Use at least 8 characters.")}
          ${!isLogin ? field("Assistant name", assistantName) : ""}
          <div class="form-error" aria-live="polite" hidden>Please enter a valid email address.</div>
          <button class="btn primary" type="button" data-route="overview">${isLogin ? "Login" : "Sign up"}</button>
          <div class="auth-links">
            <a href="#/${isLogin ? "signup" : "login"}">${isLogin ? "Create an account" : "Already have an account?"}</a>
            <a href="#/landing">Back to site</a>
          </div>
          <p class="terms">By continuing, you agree to the service terms and privacy policy. Backend authentication is intentionally not connected in this frontend pass.</p>
        </form>
      </div>
    </section>
  </main>`;
}

function field(labelText, value, type = "text", helper = "") {
  return `<label>${labelText}<input class="input" type="${type}" value="${value}" aria-label="${labelText}">${helper ? `<span class="helper">${helper}</span>` : ""}</label>`;
}

function shell(content) {
  const groups = routes.reduce((acc, item) => ((acc[item[2]] ||= []).push(item), acc), {});
  return `<div class="app-shell">
    <aside class="sidebar">
      ${brand()}
      ${Object.entries(groups).map(([group, links]) => `<div class="nav-title">${group}</div>${links.map(([id, label, , short]) => `<button class="nav-link ${currentRoute === id ? "active" : ""}" data-route="${id}"><span class="nav-icon">${short}</span>${label}</button>`).join("")}`).join("")}
    </aside>
    <main class="main">
      <header class="topbar">
        <input class="search" aria-label="Search" placeholder="Search customers, appointments, conversations">
        <div class="actions"><span class="badge success">${assistantName} online</span><button class="btn primary" data-action="book">Book appointment</button></div>
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
  return shell(`<div class="page-head">
    <div class="page-copy"><p class="eyebrow">Sunday, August 16, 2026 - Northside Wellness</p><h1>Today at a glance</h1><p>Operational work for the day, focused on appointments, active conversations, pending confirmations, and calls ${assistantName} already handled.</p></div>
    <div class="actions"><button class="btn" data-action="customer">Add customer</button><button class="btn" data-route="calendar">View calendar</button></div>
  </div>
  <div class="metric-strip">
    ${metric("34", "Appointments today")}
    ${metric("47", `Calls answered by ${assistantName}`)}
    ${metric("6", "Pending confirmations")}
    ${metric("3", "No-show risk")}
  </div>
  <div class="grid two-col">
    <section class="panel"><div class="panel-head"><div><h2>Today's appointments</h2><p class="meta">Live queue for staff and assistant activity.</p></div><span class="badge warning">6 pending</span></div>${appointmentsList()}</section>
    <div class="grid">
      <section class="panel"><div class="panel-head"><div><h2>Active conversations</h2><p class="meta">Recent customer intent across channels.</p></div></div>${conversationList()}</section>
      <section class="panel"><div class="panel-head"><div><h2>Recent activity</h2></div></div>${activityList()}</section>
    </div>
  </div>`);
}

function appointmentsList(compact = false) {
  return `<div class="list">${appointmentService.listToday().map((appointment) => `<button class="row timeline-item" data-open-appt="${appointment.id}">
    <span class="meta">${appointment.time}</span>
    <span class="row-main"><span class="row-title">${appointment.customer}</span><span class="meta">${appointment.service} with ${appointment.staff} - ${appointment.duration} - ${appointment.channel}</span></span>
    <span class="badge ${badgeClass(appointment.status)}">${appointment.status}</span>
  </button>`).slice(0, compact ? 4 : undefined).join("")}</div>`;
}

function appointmentsPage() {
  return shell(`<div class="page-head">
    <div class="page-copy"><p class="eyebrow">Appointment management</p><h1>Appointments</h1><p>Book, reschedule, cancel, confirm, and complete appointments while preserving channel and staff context.</p></div>
    <div class="actions"><button class="btn primary" data-action="book">Book</button><button class="btn">Reschedule</button><button class="btn danger" data-action="cancel">Cancel</button></div>
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
  return `<div class="list">${items.map((conversation) => `<div class="row">
    <span class="row-main"><span class="row-title">${conversation.customer}</span><span class="meta">${conversation.channel} - ${conversation.intent} - handled by ${conversation.handler}</span></span>
    <span class="badge ${badgeClass(conversation.status)}">${conversation.status}</span>
  </div>`).join("")}</div>`;
}

function activityList() {
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
    <section class="panel"><div class="panel-head"><div><h2>Call detail</h2><p class="meta">Duration ${latestCall.duration}</p></div></div><div class="detail-stack">
      <p><strong>Customer:</strong> ${latestCall.customer}</p>
      <p><strong>Status:</strong> Completed</p>
      <p><strong>Appointment action:</strong> ${latestCall.result}</p>
      <p><strong>AI summary:</strong> ${assistantName} moved the appointment from 2:00 PM to 3:45 PM and sent confirmation by SMS.</p>
      <div class="actions"><button class="btn">Recording placeholder</button><button class="btn">Transfer status: not needed</button></div>
    </div></section>
  </div>`);
}

function customersPage() {
  return shell(`<div class="page-head"><div class="page-copy"><p class="eyebrow">Customer records</p><h1>Customers</h1><p>Customer context for appointment history, risk, and next actions.</p></div><button class="btn primary" data-action="customer">Add customer</button></div>
  <div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Segment</th><th>Next action</th></tr></thead><tbody>${customerService.list().map((customer) => `<tr>${customer.map((value) => `<td>${value}</td>`).join("")}</tr>`).join("")}</tbody></table>
  <div class="mobile-list">${customerService.list().map((customer) => `<div class="row"><span class="row-main"><span class="row-title">${customer[0]}</span><span class="meta">${customer[2]} - ${customer[4]}</span></span><span class="badge">${customer[3]}</span></div>`).join("")}</div></div>`);
}

function settingsPage(label) {
  const isAssistant = label === "AI Assistant Settings";
  return shell(`<div class="page-head"><div class="page-copy"><p class="eyebrow">Configuration</p><h1>${label}</h1><p>${isAssistant ? "Assistant identity, tone, escalation rules, and appointment permissions." : "Configuration foundation for future backend-backed settings."}</p></div><button class="btn primary" data-action="save">Save changes</button></div>
  <div class="grid two-col">
    <section class="panel"><div class="panel-head"><div><h2>${isAssistant ? `${assistantName} profile` : "Settings"}</h2></div></div><div class="auth-form">
      <label>${isAssistant ? "Assistant name" : "Business name"}<input class="input" value="${isAssistant ? assistantName : "Northside Wellness"}"></label>
      <label>Mode<select class="select"><option>Active</option><option>Draft</option></select></label>
      <label>Escalation policy<select class="select"><option>Escalate pricing and conflict cases</option><option>Escalate every uncertain request</option></select></label>
    </div></section>
    <section class="panel"><div class="panel-head"><div><h2>Service boundary</h2></div></div><p>Frontend mocks are isolated behind appointmentService, customerService, conversationService, callService, and notificationService so real APIs can replace them later.</p></section>
  </div>`);
}

function analyticsPage() {
  return shell(`<div class="page-head"><div class="page-copy"><p class="eyebrow">Operational reporting</p><h1>Analytics</h1><p>Outcome-oriented reporting for bookings, escalations, response time, and customer satisfaction.</p></div></div>
  <div class="metric-strip">${metric("91%", "Booking success")}${metric("18m", "Avg response saved")}${metric("12", "Escalations")}${metric("4.8", "Customer rating")}</div>
  <section class="panel"><h2>Conversation outcomes</h2><p>Resolved appointment requests, confirmations, cancellations, and escalations will connect to analytics APIs in the backend phase.</p></section>`);
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
        <div class="actions"><button class="btn primary" data-action="confirm">Confirm</button><button class="btn">Reschedule</button><button class="btn danger" data-action="cancel">Cancel</button><button class="btn">Mark completed</button></div>
      </div>` : ""}</aside>
  </div>`;
}

function pageForRoute() {
  if (currentRoute === "landing") return landing();
  if (currentRoute === "pricing") return `<main class="landing">${publicNav()}${pricingSection()}</main>`;
  if (currentRoute === "login" || currentRoute === "signup") return authPage(currentRoute);
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

function render() {
  app.innerHTML = pageForRoute();
  document.querySelectorAll("[data-route]").forEach((element) => element.addEventListener("click", () => navigate(element.dataset.route)));
  document.querySelectorAll("[data-open-appt]").forEach((element) => element.addEventListener("click", () => {
    drawerAppointment = Number(element.dataset.openAppt);
    render();
  }));
  document.querySelectorAll("[data-action]").forEach((element) => element.addEventListener("click", () => {
    const action = element.dataset.action;
    if (action === "close") {
      drawerAppointment = null;
      render();
      return;
    }
    if (action === "cancel" && !confirm("Cancel this appointment?")) return;
    showToast(notificationService.messageFor(action));
  }));
}

render();
