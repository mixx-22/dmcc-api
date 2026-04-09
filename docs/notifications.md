# Notifications Feature — Frontend Integration Guide

## Overview

The backend now supports a **real-time notification system** built on **Socket.io** (WebSocket) with **persistent storage** in MongoDB. Notifications are automatically created when audit-related actions occur and are delivered in real-time to connected users. Each user only receives notifications relevant to their role types and team memberships.

---

## Architecture

```
Backend action (e.g. schedule created)
  → notification.service resolves recipients by roleType / team
  → notification persisted to MongoDB (Notification collection)
  → Socket.io emits "notification" event to each recipient's personal room
  → Frontend receives event in real-time
```

- **Persistence**: Every notification is stored in the database regardless of whether the user is online.
- **Real-time**: If the user has an active WebSocket connection, they receive the notification instantly via a `"notification"` event.
- **Per-user rooms**: Each authenticated user is placed in a Socket.io room `user:<userId>`. Notifications are emitted only to the intended recipient's room.

---

## Notification Types & Recipients

| Type                    | Title                           | Recipients                                                                                      |
| ----------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `SCHEDULE_CREATED`      | Audit Schedule Created          | All **Admin** role-type users                                                                   |
| `SCHEDULE_UPDATED`      | Audit Schedule Updated          | All **Admin** role-type users                                                                   |
| `SCHEDULE_CLOSED`       | Audit Schedule Closed           | **Admin** + **Auditors** assigned in that schedule + **Team Leaders** of teams in that schedule |
| `SCHEDULE_DELETED`      | Audit Schedule Deleted          | All **Admin** role-type users                                                                   |
| `ORGANIZATION_ADDED`    | Organization Added to Audit     | All **Admin** role-type users                                                                   |
| `ORGANIZATION_DELETED`  | Organization Removed from Audit | All **Admin** role-type users                                                                   |
| `TEAM_ADDED_AS_ORG`     | Your Team Added to Audit        | **Team Leaders** of the team that was added                                                     |
| `FINDING_ADDED`         | Finding Added                   | All **Admin** role-type users                                                                   |
| `FINDING_NC_ADDED`      | Non-Conformity Finding Added    | **Team Leaders** of the affected team                                                           |
| `VERDICT_SET`           | Final Verdict Set               | All **QMR** role-type users                                                                     |
| `AUDITOR_ASSIGNED`      | Assigned as Auditor             | The specific user(s) being assigned                                                             |
| `AUDITOR_REMOVED`       | Removed as Auditor              | The specific user(s) being removed                                                              |
| `ACTION_PLAN_SUBMITTED` | Action Plan Submitted           | **Auditors** assigned to that organization                                                      |

> **Note:** The user who performed the action is always **excluded** from their own notification.

---

## Notification Object Schema

Every notification (from REST API or WebSocket event) has this shape:

```json
{
  "_id": "664f1a2b3c4d5e6f7a8b9c0d",
  "recipient": "664f1a2b3c4d5e6f7a8b9c01",
  "type": "SCHEDULE_CREATED",
  "title": "Audit Schedule Created",
  "message": "John Doe created audit schedule \"Internal Audit 2026\".",
  "data": {
    "scheduleId": "664f1a2b3c4d5e6f7a8b9c10",
    "scheduleTitle": "Internal Audit 2026"
  },
  "read": false,
  "createdAt": "2026-04-09T12:00:00.000Z",
  "updatedAt": "2026-04-09T12:00:00.000Z"
}
```

### `data` field contents by type

| Type                    | `data` fields                                                |
| ----------------------- | ------------------------------------------------------------ |
| `SCHEDULE_CREATED`      | `scheduleId`, `scheduleTitle`                                |
| `SCHEDULE_UPDATED`      | `scheduleId`, `scheduleTitle`                                |
| `SCHEDULE_CLOSED`       | `scheduleId`, `scheduleTitle`                                |
| `SCHEDULE_DELETED`      | `scheduleId`, `scheduleTitle`                                |
| `ORGANIZATION_ADDED`    | `orgId`, `teamId`, `teamName`, `scheduleId`                  |
| `ORGANIZATION_DELETED`  | `orgId`, `scheduleId`                                        |
| `TEAM_ADDED_AS_ORG`     | `orgId`, `teamId`, `teamName`, `scheduleId`                  |
| `FINDING_ADDED`         | `orgId`, `teamId`, `teamName`, `scheduleId`, `findingsCount` |
| `FINDING_NC_ADDED`      | `orgId`, `teamId`, `teamName`, `scheduleId`, `ncCount`       |
| `VERDICT_SET`           | `orgId`, `teamId`, `verdict`, `scheduleId`                   |
| `AUDITOR_ASSIGNED`      | `teamName`                                                   |
| `AUDITOR_REMOVED`       | `teamName`                                                   |
| `ACTION_PLAN_SUBMITTED` | `orgId`, `teamId`, `teamName`, `scheduleId`                  |

---

## REST API Endpoints

All endpoints require the `Authorization: Bearer <token>` header.

### 1. Get Notifications

```
GET /notifications
```

**Query parameters:**

| Param   | Type   | Default | Description                                               |
| ------- | ------ | ------- | --------------------------------------------------------- |
| `page`  | number | `1`     | Page number (1-indexed)                                   |
| `limit` | number | `20`    | Items per page (max 100)                                  |
| `read`  | string | —       | Filter: `"true"` for read only, `"false"` for unread only |

**Response (200):**

```json
{
  "success": true,
  "data": [
    /* array of notification objects */
  ],
  "unreadCount": 5,
  "meta": {
    "total": 42,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

### 2. Get Unread Count

```
GET /notifications/unread-count
```

**Response (200):**

```json
{
  "success": true,
  "unreadCount": 5
}
```

### 3. Mark Single Notification as Read

```
PATCH /notifications/:id/read
```

**Response (200):**

```json
{
  "success": true,
  "notification": {
    /* updated notification object with read: true */
  }
}
```

### 4. Mark All Notifications as Read

```
PATCH /notifications/read-all
```

**Response (200):**

```json
{
  "success": true,
  "message": "5 notification(s) marked as read."
}
```

### 5. Delete a Notification

```
DELETE /notifications/:id
```

**Response (200):**

```json
{
  "success": true,
  "message": "Notification deleted."
}
```

> All endpoints enforce ownership — a user can only access/modify/delete their own notifications.

---

## WebSocket (Socket.io) Integration

### 1. Install dependency

```bash
npm install socket.io-client
```

### 2. Connect with authentication

The WebSocket server runs on the **same host and port** as the REST API. Pass the JWT token in the `auth` handshake:

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:8000", {
  auth: {
    token: "<JWT_TOKEN>", // same token used for REST API
  },
  // Alternative: pass as query param
  // query: { token: "<JWT_TOKEN>" },
});

socket.on("connect", () => {
  console.log("Connected to notification server");
});

socket.on("connect_error", (err) => {
  console.error("Connection error:", err.message);
  // "Authentication required" or "Invalid token"
});
```

### 3. Listen for notifications

```javascript
socket.on("notification", (notification) => {
  // notification is the full notification object (same shape as REST API)
  console.log("New notification:", notification);

  // Show toast, update badge count, trigger browser notification, etc.
});
```

### 4. Reconnection

Socket.io automatically handles reconnection with exponential backoff. No additional configuration needed. On reconnect, the user is automatically re-joined to their personal room.

### 5. Disconnect

```javascript
socket.disconnect();
```

---

## Frontend Implementation Guide

### Notification List Page / Dropdown

1. **Initial load**: Call `GET /notifications?limit=20` to fetch the first page. Use `unreadCount` from the response to display a badge.
2. **Pagination**: Use `page` and `limit` query params. The `meta` object tells you `total`, `totalPages`, etc.
3. **Filter tabs**: Use `?read=false` for unread, `?read=true` for read, or omit for all.
4. **Mark as read**: When a user clicks a notification, call `PATCH /notifications/:id/read`.
5. **Mark all as read**: Provide a "Mark all as read" button that calls `PATCH /notifications/read-all`.
6. **Delete**: Swipe-to-delete or a delete button calls `DELETE /notifications/:id`.

### Toast Notifications (Real-time)

1. Listen to the `"notification"` WebSocket event.
2. On each event, show a **toast notification** with:
   - `notification.title` as the heading
   - `notification.message` as the body
   - Use `notification.type` to pick an icon or color (e.g., red for NC findings, orange for warnings, blue for info)
3. Clicking the toast should navigate to the relevant page using `notification.data` (e.g., navigate to the audit schedule using `data.scheduleId`).
4. Auto-dismiss toasts after 5–8 seconds, but keep the notification in the list.
5. Update the unread badge count: increment by 1 for each incoming notification.

### Browser Notifications (while tab is open)

Use the [Notification API](https://developer.mozilla.org/en-US/docs/Web/API/Notification) for browser-level notifications:

```javascript
// Request permission on first visit or login
if (Notification.permission === "default") {
  Notification.requestPermission();
}

socket.on("notification", (notif) => {
  // Show browser notification if permitted and tab is not focused
  if (Notification.permission === "granted" && document.hidden) {
    const browserNotif = new Notification(notif.title, {
      body: notif.message,
      icon: "/path/to/app-icon.png",
      tag: notif._id, // prevents duplicate browser notifications
    });

    browserNotif.onclick = () => {
      window.focus();
      // Navigate to relevant page based on notif.type / notif.data
    };
  }

  // Always show in-app toast regardless of browser notification
  showToast(notif);
});
```

**Key considerations:**

- Request permission after a user action (e.g., login, clicking "Enable notifications"), never on page load.
- Use `document.hidden` to only show browser notifications when the tab is in the background.
- Use the `tag` property to prevent duplicate browser notifications for the same event.
- Browser notifications only work while the tab is open (no service worker / push notifications in this version).

### Notification Badge

```javascript
// On initial load
const { unreadCount } = await fetch("/notifications?limit=1").then((r) =>
  r.json(),
);
setBadgeCount(unreadCount);

// On real-time notification
socket.on("notification", () => {
  setBadgeCount((prev) => prev + 1);
});

// After marking as read
await fetch(`/notifications/${id}/read`, { method: "PATCH" });
setBadgeCount((prev) => Math.max(0, prev - 1));

// After marking all as read
await fetch("/notifications/read-all", { method: "PATCH" });
setBadgeCount(0);
```

Alternatively, use the dedicated `GET /notifications/unread-count` endpoint to refresh the count after any mutation.

---

## Suggested Type-to-UI Mapping

Use `notification.type` to determine icon, color, and navigation target:

```javascript
const NOTIFICATION_CONFIG = {
  SCHEDULE_CREATED: {
    icon: "calendar-plus",
    color: "blue",
    nav: (d) => `/schedules/${d.scheduleId}`,
  },
  SCHEDULE_UPDATED: {
    icon: "calendar-edit",
    color: "blue",
    nav: (d) => `/schedules/${d.scheduleId}`,
  },
  SCHEDULE_CLOSED: {
    icon: "calendar-check",
    color: "green",
    nav: (d) => `/schedules/${d.scheduleId}`,
  },
  SCHEDULE_DELETED: {
    icon: "calendar-x",
    color: "red",
    nav: () => `/schedules`,
  },
  ORGANIZATION_ADDED: {
    icon: "building-plus",
    color: "blue",
    nav: (d) => `/schedules/${d.scheduleId}`,
  },
  ORGANIZATION_DELETED: {
    icon: "building-x",
    color: "red",
    nav: (d) => `/schedules/${d.scheduleId}`,
  },
  TEAM_ADDED_AS_ORG: {
    icon: "users-plus",
    color: "purple",
    nav: (d) => `/schedules/${d.scheduleId}`,
  },
  FINDING_ADDED: {
    icon: "search",
    color: "orange",
    nav: (d) => `/organizations/${d.orgId}`,
  },
  FINDING_NC_ADDED: {
    icon: "alert-triangle",
    color: "red",
    nav: (d) => `/organizations/${d.orgId}`,
  },
  VERDICT_SET: {
    icon: "gavel",
    color: "green",
    nav: (d) => `/organizations/${d.orgId}`,
  },
  AUDITOR_ASSIGNED: {
    icon: "user-check",
    color: "blue",
    nav: () => `/schedules`,
  },
  AUDITOR_REMOVED: {
    icon: "user-minus",
    color: "orange",
    nav: () => `/schedules`,
  },
  ACTION_PLAN_SUBMITTED: {
    icon: "clipboard-check",
    color: "green",
    nav: (d) => `/organizations/${d.orgId}`,
  },
};
```

---

## Socket.io Connection Lifecycle (Recommended)

```javascript
// services/socket.js
import { io } from "socket.io-client";

let socket = null;

export const connectSocket = (token) => {
  if (socket?.connected) return socket;

  socket = io(import.meta.env.VITE_API_URL || "http://localhost:8000", {
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity,
  });

  socket.on("connect", () => console.log("[WS] Connected"));
  socket.on("disconnect", (reason) =>
    console.log("[WS] Disconnected:", reason),
  );
  socket.on("connect_error", (err) =>
    console.error("[WS] Error:", err.message),
  );

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const getSocket = () => socket;
```

**Usage:**

- Call `connectSocket(token)` after successful login.
- Call `disconnectSocket()` on logout.
- In notification components, use `getSocket()` to attach listeners.

---

## Provisions for Future Enhancements

The current implementation is fully functional for local development. The following features can be added when deployed:

| Feature                      | What to add                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Push Notifications**       | Add a service worker + Web Push API (VAPID keys). Store push subscriptions in DB.                                               |
| **Email Notifications**      | Add nodemailer or a transact email service (SendGrid, SES). Trigger from notification.service.js alongside WebSocket broadcast. |
| **Socket.io Adapter**        | For multi-server deployments, use `@socket.io/redis-adapter` so all instances share the same rooms.                             |
| **Notification Preferences** | Add a user preference model to let users opt out of specific notification types.                                                |
| **Batching / Digest**        | Add a cron job that aggregates unread notifications into a daily/weekly email digest.                                           |

The notification service is designed with a pluggable `createAndBroadcast` core — adding new delivery channels (email, push) only requires adding new emission logic alongside the existing Socket.io emit.
