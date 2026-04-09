# Notifications Feature – Frontend Integration Guide

> **Audience**: Frontend developer / AI agent building the React (or similar) client.
> **Backend version**: DMCC-API with the notifications feature branch.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Role-Based Notification Matrix](#3-role-based-notification-matrix)
4. [REST API Reference](#4-rest-api-reference)
5. [WebSocket Integration](#5-websocket-integration)
6. [Notification Data Shape](#6-notification-data-shape)
7. [Frontend Implementation Guide](#7-frontend-implementation-guide)
8. [Browser Notifications](#8-browser-notifications)
9. [Best Practices](#9-best-practices)

---

## 1. Overview

The notifications feature provides **real-time, role-based notifications** for audit schedule actions. Notifications are:

- **Persisted** in MongoDB so they survive page reloads.
- **Pushed in real time** via WebSocket to all connected browser tabs.
- **Targeted by role type**: Admin, QMR, Auditor, Team Leader.
- **Scoped per user**: each user only sees their own notifications.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Backend (Node.js)                 │
│                                                     │
│  Controller action (e.g. create schedule)            │
│       │                                             │
│       ▼                                             │
│  notification.service.js                            │
│    ├─ Resolves recipients by roleType               │
│    ├─ Creates Notification docs in MongoDB          │
│    └─ Pushes via websocket.js → sendToUsers()       │
│                                                     │
│  WebSocket Server (/ws?token=JWT)                   │
│    └─ Authenticated per-user channels               │
│                                                     │
│  REST API (/notifications/*)                        │
│    └─ List, count, mark read, delete                │
└─────────────────────────────────────────────────────┘
         │ WS push              │ HTTP poll/fetch
         ▼                      ▼
┌─────────────────────────────────────────────────────┐
│                   Frontend (React)                   │
│                                                     │
│  useNotifications() hook                            │
│    ├─ WebSocket listener → new notification         │
│    ├─ REST fetch → load history / unread count      │
│    ├─ Toast display (react-hot-toast / sonner)      │
│    └─ Browser Notification API                      │
│                                                     │
│  NotificationList component                         │
│    ├─ Paginated list with read/unread filter        │
│    ├─ Mark as read (single / all)                   │
│    └─ Delete notification                           │
└─────────────────────────────────────────────────────┘
```

---

## 3. Role-Based Notification Matrix

| Event | Admin | QMR | Auditor | Team Leader |
|---|:---:|:---:|:---:|:---:|
| Audit Schedule Created | ✅ | | | |
| Audit Schedule Updated | ✅ | | | |
| Audit Schedule Closed | ✅ | | ✅ ¹ | ✅ ² |
| Audit Schedule Deleted | ✅ | | | |
| Organization Added | ✅ | | | ✅ ³ |
| Organization Updated | ✅ | | | |
| Organization Deleted | ✅ | | | |
| Auditor Assigned | ✅ | | ✅ ⁴ | |
| Auditor Removed | ✅ | | ✅ ⁴ | |
| Verdict Set | ✅ | ✅ | | |
| Finding Added (NC) | ✅ | | | ✅ ⁵ |
| Action Plan Submitted | ✅ | | ✅ ⁶ | |
| Visit Added | ✅ | | | |

**Legend:**
1. Auditors assigned to any org in the schedule
2. Team Leaders of teams that are orgs in the schedule
3. Leaders of the specific team being added
4. The specific auditor(s) being assigned/removed
5. Leaders of the team receiving the NC finding
6. Auditors of the org whose finding received an action plan

---

## 4. REST API Reference

All endpoints require the `Authorization: Bearer <JWT>` header.

### 4.1 List Notifications

```
GET /notifications
```

**Query Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Items per page (max 100) |
| `read` | string | – | Filter: `"true"` or `"false"` |
| `roleType` | string | – | Filter: `"admin"`, `"qmr"`, `"auditor"`, `"teamLeader"` |

**Response:**

```json
{
  "success": true,
  "message": "Notifications retrieved successfully",
  "data": [ /* Notification objects */ ],
  "meta": {
    "total": 42,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

### 4.2 Get Unread Count

```
GET /notifications/unread-count
```

**Response:**

```json
{
  "success": true,
  "count": 7
}
```

### 4.3 Mark Single Notification as Read

```
PATCH /notifications/:id/read
```

**Response:**

```json
{
  "success": true,
  "message": "Notification marked as read",
  "data": { /* updated Notification object */ }
}
```

### 4.4 Mark All Notifications as Read

```
PATCH /notifications/read-all
```

**Response:**

```json
{
  "success": true,
  "message": "All notifications marked as read",
  "modifiedCount": 7
}
```

### 4.5 Delete Notification

```
DELETE /notifications/:id
```

**Response:**

```json
{
  "success": true,
  "message": "Notification deleted"
}
```

---

## 5. WebSocket Integration

### 5.1 Connection

Connect to the WebSocket server using the user's JWT token:

```
ws://localhost:8000/ws?token=<JWT>
```

> **Production**: Use `wss://` (TLS) instead of `ws://`.

### 5.2 Connection Lifecycle

```
Client                          Server
  │                                │
  │─── WS upgrade /ws?token=JWT ──►│
  │                                │── verify JWT
  │◄── { type: "CONNECTED" } ─────│
  │                                │
  │◄── { type: "NOTIFICATION" } ──│  (when events occur)
  │◄── { type: "NOTIFICATION" } ──│
  │                                │
  │◄── ping ──────────────────────│  (every 30s keep-alive)
  │─── pong ──────────────────────►│
  │                                │
  │─── close ─────────────────────►│
```

### 5.3 Message Types

#### CONNECTED (server → client)

Sent once after a successful handshake.

```json
{
  "type": "CONNECTED",
  "message": "WebSocket connected"
}
```

#### NOTIFICATION (server → client)

Sent whenever a new notification is created for this user.

```json
{
  "type": "NOTIFICATION",
  "payload": {
    "_id": "665a1b...",
    "recipient": "664f3a...",
    "type": "SCHEDULE_CREATED",
    "title": "Audit Schedule Created",
    "message": "A new audit schedule \"INT-2025-01\" has been created by John Doe.",
    "roleType": "admin",
    "entity": {
      "kind": "Schedule",
      "id": "665a1a..."
    },
    "actor": {
      "id": "664f3a...",
      "name": "John Doe"
    },
    "read": false,
    "readAt": null,
    "createdAt": "2025-06-01T08:30:00.000Z",
    "updatedAt": "2025-06-01T08:30:00.000Z"
  }
}
```

### 5.4 Frontend WebSocket Code Example

```javascript
// useWebSocket.js – custom hook (React)
import { useEffect, useRef, useCallback } from "react";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws";
const RECONNECT_INTERVAL = 5000; // ms

export function useWebSocket(token, onNotification) {
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  const connect = useCallback(() => {
    if (!token) return;

    const ws = new WebSocket(`${WS_URL}?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[ws] Connected");
      clearTimeout(reconnectTimer.current);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "NOTIFICATION") {
          onNotification(data.payload);
        }
      } catch (err) {
        console.error("[ws] Parse error:", err);
      }
    };

    ws.onclose = () => {
      console.log("[ws] Disconnected – reconnecting…");
      reconnectTimer.current = setTimeout(connect, RECONNECT_INTERVAL);
    };

    ws.onerror = (err) => {
      console.error("[ws] Error:", err);
      ws.close();
    };
  }, [token, onNotification]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return wsRef;
}
```

---

## 6. Notification Data Shape

```typescript
interface Notification {
  _id: string;
  recipient: string;             // User ID

  type: NotificationType;        // e.g. "SCHEDULE_CREATED"
  title: string;                 // Short title for display
  message: string;               // Longer description

  roleType: "admin" | "qmr" | "auditor" | "teamLeader";

  entity: {
    kind: "Schedule" | "Organization" | "Visit" | "Finding" | "User" | "Team" | null;
    id: string | null;
  };

  actor: {
    id: string;
    name: string;
  };

  read: boolean;
  readAt: string | null;         // ISO date string

  createdAt: string;             // ISO date string
  updatedAt: string;
}

type NotificationType =
  | "SCHEDULE_CREATED"
  | "SCHEDULE_UPDATED"
  | "SCHEDULE_CLOSED"
  | "SCHEDULE_DELETED"
  | "ORGANIZATION_ADDED"
  | "ORGANIZATION_UPDATED"
  | "ORGANIZATION_DELETED"
  | "FINDING_ADDED"
  | "FINDING_UPDATED"
  | "VERDICT_SET"
  | "AUDITOR_ASSIGNED"
  | "AUDITOR_REMOVED"
  | "VISIT_ADDED"
  | "VISIT_UPDATED"
  | "ACTION_PLAN_SUBMITTED"
  | "QMR_VERDICT_SET"
  | "AUDITOR_ASSIGNED_TO_ORG"
  | "AUDITOR_REMOVED_FROM_ORG"
  | "AUDITOR_ACTION_PLAN_SUBMITTED"
  | "AUDITOR_SCHEDULE_CLOSED"
  | "TEAM_ADDED_AS_ORG"
  | "TEAM_NC_FINDING_ADDED"
  | "TEAM_SCHEDULE_CLOSED";
```

---

## 7. Frontend Implementation Guide

### 7.1 Notification Bell & Badge

Add a bell icon in the top navigation bar with an unread count badge.

```
┌──────────────────────────────────────────┐
│  DMCC Portal          🔔 (7)   👤 John  │
└──────────────────────────────────────────┘
```

**Implementation:**
- On app mount, fetch `GET /notifications/unread-count` to get the initial badge count.
- When a WebSocket `NOTIFICATION` message arrives, increment the badge count.
- When `mark-all-as-read` is called, reset the badge count to 0.

### 7.2 Notification Dropdown / Panel

Clicking the bell opens a dropdown or side panel with the list of notifications.

**Implementation:**
- Fetch `GET /notifications?limit=20` for the initial list.
- Use infinite scroll or pagination for older notifications.
- Display each notification with:
  - **Icon** based on `type` or `roleType` (colour-coded).
  - **Title** (bold if unread).
  - **Message** (truncated).
  - **Relative time** (e.g. "2 minutes ago").
  - **Read indicator** (dot for unread).
- Clicking a notification:
  1. Calls `PATCH /notifications/:id/read`.
  2. Navigates to the relevant entity (schedule, organization, etc.) using `entity.kind` and `entity.id`.
- "Mark all as read" button calls `PATCH /notifications/read-all`.

### 7.3 Toast Notifications

When a WebSocket notification arrives while the user is on the page, display a toast.

**Recommended libraries:**
- `react-hot-toast`
- `sonner`
- `react-toastify`

**Implementation:**

```javascript
// In your useNotifications hook or context provider:
const handleNotification = (notification) => {
  // 1. Add to local notifications state
  setNotifications(prev => [notification, ...prev]);

  // 2. Increment unread count
  setUnreadCount(prev => prev + 1);

  // 3. Show toast
  toast(notification.title, {
    description: notification.message,
    duration: 5000,
    action: {
      label: "View",
      onClick: () => navigateToEntity(notification.entity),
    },
  });

  // 4. Show browser notification (if permission granted)
  showBrowserNotification(notification);
};
```

### 7.4 Persisting Notification State

Notifications are already persisted on the backend. The frontend should:

- **Not** store notifications in localStorage (the DB is the source of truth).
- Cache the current page of notifications in React state / Zustand / Redux.
- Re-fetch on reconnect (WebSocket `onopen` after a disconnect).
- Optimistically update read status when the user clicks "mark as read".

### 7.5 Navigation from Notification

Use the `entity` field to link notifications to the relevant page:

```javascript
const navigateToEntity = (entity) => {
  if (!entity?.kind || !entity?.id) return;

  const routes = {
    Schedule: `/audit-schedules/${entity.id}`,
    Organization: `/organizations/${entity.id}`,
    // Add more as needed
  };

  const path = routes[entity.kind];
  if (path) navigate(path);
};
```

---

## 8. Browser Notifications

Use the [Notification API](https://developer.mozilla.org/en-US/docs/Web/API/Notification) to show OS-level notifications while the tab is open.

### 8.1 Request Permission

Request permission once when the user first logs in or opens the app:

```javascript
const requestNotificationPermission = async () => {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;

  const permission = await Notification.requestPermission();
  return permission === "granted";
};
```

### 8.2 Show Browser Notification

```javascript
const showBrowserNotification = (notification) => {
  if (Notification.permission !== "granted") return;
  if (document.hasFocus()) return; // Skip if tab is focused (toast is enough)

  const browserNotif = new Notification(notification.title, {
    body: notification.message,
    icon: "/logo.png",          // Your app icon
    tag: notification._id,       // Prevents duplicates
    requireInteraction: false,
    silent: false,
  });

  browserNotif.onclick = () => {
    window.focus();
    navigateToEntity(notification.entity);
    browserNotif.close();
  };

  // Auto-close after 8 seconds
  setTimeout(() => browserNotif.close(), 8000);
};
```

### 8.3 Important Notes

- Browser notifications only work while the tab is open (no Service Worker / push subscription needed for this scope).
- Only show browser notifications when the tab is **not** focused (`!document.hasFocus()`). When the tab is focused, the toast is sufficient.
- Use the `tag` property to prevent duplicate notifications for the same event.
- The browser notification permission persists across sessions per origin.

---

## 9. Best Practices

### Performance
- **Debounce unread count fetches** – don't re-fetch on every WebSocket message; update locally and sync periodically.
- **Paginate** – never load all notifications at once. Use `limit=20` and load more on scroll.
- **WebSocket reconnect** – implement exponential backoff with a maximum delay (e.g. 5s → 10s → 30s → cap at 60s).

### UX
- **Don't over-notify** – the backend already deduplicates per-update. The frontend should collapse multiple rapid toasts (e.g. batch arrivals within 1 second).
- **Distinguish by role type** – use different colours or icons per `roleType`:
  - 🔴 Admin (red/coral)
  - 🔵 QMR (blue)
  - 🟡 Auditor (amber)
  - 🟢 Team Leader (green)
- **Relative timestamps** – use a library like `date-fns` (`formatDistanceToNow`) or `dayjs` for "2 minutes ago" display.
- **Empty state** – show "No notifications yet" when the list is empty.

### Security
- **Never expose other users' notifications** – the backend enforces this (filters by `recipient = req.user`).
- **Token refresh** – if the JWT expires, close the WebSocket and reconnect with a fresh token.
- **Sanitise notification messages** – the `message` field is server-generated, but always escape HTML before rendering to prevent XSS.

### Resilience
- On WebSocket disconnect, show a subtle "Reconnecting…" indicator.
- On reconnect, re-fetch `GET /notifications/unread-count` and the latest page to catch any notifications missed during the disconnect.
- Handle HTTP 401 from notification endpoints by redirecting to login.

---

## Appendix: Environment Variables

| Variable | Example | Description |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8000` | Backend REST API base URL |
| `VITE_WS_URL` | `ws://localhost:8000/ws` | WebSocket endpoint (derive from API URL) |

For production, replace `ws://` with `wss://` and ensure your reverse proxy (nginx, etc.) supports WebSocket upgrades on the `/ws` path.
