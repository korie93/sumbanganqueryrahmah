# ARCHITECTURE.md

## System Architecture Overview

### Frontend

-   React
-   TypeScript
-   Component architecture
-   WebSocket connections
-   AI chat interface

### Backend

-   Node.js
-   Express
-   Drizzle ORM
-   PostgreSQL database
-   REST APIs

### Recommended Folder Structure

server ├ controllers ├ services ├ repositories ├ middleware ├ routes ├
config ├ utils └ db

### Request Flow

routes → controllers → services → repositories → database

### Principles

-   Separation of concerns
-   Layered architecture
-   Testable services
-   Centralized error handling
