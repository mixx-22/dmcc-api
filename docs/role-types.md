# Role Types — Front-End Integration Guide

## Overview

Every role in the system can now carry one or more **functional type tags** (`roleTypes`).  
These tags indicate _what kind of role_ a role is, independently of the role's `title`.  
For example, a role titled `"Head Admin"` can be tagged as `admin`, while a role titled `"QMR Lead"` can be tagged as `qmr`.

This is different from the role's `title`; the title is a free-form label, while `roleTypes` is a structured classification used by the system (e.g., for determining notification recipients).

---

## Allowed Values

| Tag value    | Meaning                  |
|--------------|--------------------------|
| `admin`      | Administrator type role  |
| `qmr`        | QMR type role            |
| `auditor`    | Auditor type role        |
| `teamLeader` | Team Leader type role    |

A role may have **zero, one, or multiple** tags (e.g., a role could be both `admin` and `teamLeader`).

---

## API Reference

### Create a Role — `POST /roles`

Include `roleTypes` in the request body.

**Request body**
```json
{
  "title": "Head Admin",
  "description": "Top-level administrator",
  "roleTypes": ["admin"]
}
```

**Response (201)**
```json
{
  "message": "Role registered successfully.",
  "role": {
    "id": "<mongo_id>",
    "title": "Head Admin",
    "description": "Top-level administrator",
    "permissions": { "...": "..." },
    "roleTypes": ["admin"]
  }
}
```

---

### Update a Role — `PUT /roles/:id` or `PATCH /roles/:id`

Send `roleTypes` to **replace** the role's current tags entirely.

**Request body** (partial update — only send what needs to change)
```json
{
  "roleTypes": ["qmr", "auditor"]
}
```

**Response (200)**
```json
{
  "message": "Role updated successfully.",
  "role": {
    "_id": "<mongo_id>",
    "title": "QMR Lead",
    "roleTypes": ["qmr", "auditor"],
    "...": "..."
  }
}
```

To **clear** all role type tags, send an empty array:
```json
{ "roleTypes": [] }
```

---

### Get All Roles — `GET /roles`

Each role object in the `data` array includes `roleTypes`.

```json
{
  "data": [
    {
      "_id": "<mongo_id>",
      "title": "Head Admin",
      "roleTypes": ["admin"],
      "...": "..."
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 10, "totalPages": 1 }
}
```

---

### Get a Single Role — `GET /roles/:id`

```json
{
  "data": {
    "_id": "<mongo_id>",
    "title": "Head Admin",
    "roleTypes": ["admin"],
    "...": "..."
  }
}
```

---

## Validation

| Condition                              | HTTP status | Message                                              |
|----------------------------------------|-------------|------------------------------------------------------|
| `roleTypes` is not an array            | `400`       | `"roleTypes must be an array."`                      |
| `roleTypes` contains an unknown value  | `400`       | `"Invalid roleTypes: <val>. Allowed values: ..."`    |

---

## UI Recommendations

- Display `roleTypes` as a multi-select chip/tag component on the role form.
- Use the four allowed values as the option list; show them with human-friendly labels (e.g., `teamLeader` → "Team Leader").
- On the role list/table, render `roleTypes` as small badges next to the role title for quick identification.
- When `roleTypes` is empty (`[]`), show nothing (or a subtle "—" placeholder).
- To ask _"Is this role an Admin-type role?"_, check whether `roleTypes.includes("admin")` is `true`.
