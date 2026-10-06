-- DocuMind source database backup
-- Generated: 2026-09-03T17:10:58.519Z
-- Source: local prisma dev server (localhost:51214/template1)
-- Schema is defined by prisma/migrations/*; apply those via `prisma migrate deploy`
-- before running this data-only restore script.

BEGIN;

-- Table: "User"
INSERT INTO "User" ("id", "name", "email", "password", "role", "createdAt", "updatedAt") VALUES (1, 'Aziz', 'aziz.slim@gmail.com', 'testtest123', 'USER', '2026-08-25T18:41:48.713Z', '2026-08-25T18:41:48.713Z');
INSERT INTO "User" ("id", "name", "email", "password", "role", "createdAt", "updatedAt") VALUES (2, 'Aziz', 'aziz1d916711@example.com', '$2b$12$HhFryQwCaBdL72QLl1B9DOLDSRqCTUhtVUvdYQR6VxeHInb563hjS', 'USER', '2026-08-25T18:43:35.715Z', '2026-08-25T18:43:35.715Z');
INSERT INTO "User" ("id", "name", "email", "password", "role", "createdAt", "updatedAt") VALUES (34, 'aziz', 'slimaziz123@gmail.com', '$2b$12$aOPbfzdCDWmpUWR4wOO3Aeu7.6rj6ptpcI/2hmcHi9LbBXnRpPEry', 'USER', '2026-08-25T19:14:31.482Z', '2026-08-25T19:14:31.482Z');
INSERT INTO "User" ("id", "name", "email", "password", "role", "createdAt", "updatedAt") VALUES (67, 'slim', 'slim.aziz382@gmail.com', '$2b$12$VLrA6ldBhHYTuDJvaAHslOaSZ87N60dFdIt4Qs0CmVsDYs3b1cDd.', 'USER', '2026-08-28T11:15:52.792Z', '2026-08-28T11:15:52.792Z');
INSERT INTO "User" ("id", "name", "email", "password", "role", "createdAt", "updatedAt") VALUES (68, 'slim', 'slim.aziz@gmail.com', '$2b$12$iN3bQLvl6ypobIDD4OlvdOwp1uiK.0t3rKCeB1ja/cyAh5VNYiqOi', 'USER', '2026-08-29T11:13:16.253Z', '2026-08-29T11:13:16.253Z');
INSERT INTO "User" ("id", "name", "email", "password", "role", "createdAt", "updatedAt") VALUES (69, 'azizz', 'azizaziiz@gmail.com', '$2b$12$i5rWyNioprJ1qfq74LS7/O71Yl5O.DHovXQBrzC4Am0D3AMruT1SC', 'USER', '2026-08-29T11:24:29.897Z', '2026-08-29T11:24:29.897Z');
INSERT INTO "User" ("id", "name", "email", "password", "role", "createdAt", "updatedAt") VALUES (172, 'azizzz', 'slimaziz1234@gmail.com', '$2b$12$sAj4enQCgJQXgReW/9BDEu9vZIdu8mqNU/M/RK0lQiyUIQxxd.Wj6', 'USER', '2026-09-03T15:20:08.180Z', '2026-09-03T15:20:08.180Z');

-- Table: "Category"


-- Table: "Document"
INSERT INTO "Document" ("id", "name", "description", "originalName", "mimeType", "size", "filePath", "status", "extractedText", "processingError", "userId", "categoryId", "createdAt", "updatedAt") VALUES (80, 'a', 'aa', 'DocuMind_Project_Technical_Glossary_and_Concepts.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 45424, 'a1834a15-61ce-408b-98e4-09f15235a16d.docx', 'READY', 'DOCUMIND

Project Concepts, Architecture & Technical Glossary

Practical reference for the AI Document Platform

Project Stack

Frontend: React + Vite + TypeScript

Backend: NestJS + TypeScript

Database: PostgreSQL

ORM: Prisma 7

Authentication: JWT + bcryptjs

AI: LLM + RAG

Vector retrieval: embeddings + vector search

Processing: background jobs + workers



Contents

1. The Big Picture

2. Project Architecture

3. Web & Backend Concepts

4. Database & Prisma

5. Authentication & Security

6. Frontend Authentication

7. NestJS Concepts

8. Documents & File Processing

9. Background Processing & Job Queues

10. AI / RAG

11. Embeddings & Vector Search

12. HTTP & API Reference

13. Environment Variables & Secrets

14. Development Workflow

15. Authentication Flow — Full Explanation

16. Quick Reference

1. The Big Picture

DocuMind is an AI Document Platform. The user interacts with a React frontend. The frontend communicates with a NestJS backend through HTTP APIs. The backend uses Prisma to communicate with PostgreSQL. Later, documents are processed and used by an AI/RAG pipeline.

Core path: React → HTTP API → NestJS → Prisma → PostgreSQL

The browser should not communicate directly with PostgreSQL. The backend is the controlled layer between the user interface and the database.

2. Project Architecture

Public:

/ → Welcome Page

/login → Login

/register → Registration

Protected Main Application:

/app → Main Application Workspace

/app/dashboard → Statistics and overview

/app/documents → Document management

/app/assistant → AI Assistant

/app/categories → Categories

/app/search → Search

/app/settings → Settings

Important: the Dashboard is NOT the Main Application. The Main Application is the authenticated workspace where users access DocuMind features. The Dashboard is one page inside it and focuses on statistics.

3. Web & Backend Concepts

Frontend — The part users see and interact with in the browser.

Project example: React builds DocuMind''s interface.

Backend — The server-side application responsible for business logic, APIs, security and database access.

Project example: DocuMind uses NestJS.

API — A defined interface through which software components communicate.

Project example: React calls POST /api/auth/login.

HTTP — The protocol used for web requests and responses.

Project example: The browser sends HTTP requests to NestJS.

Endpoint — A specific API URL plus HTTP method.

Project example: POST /api/auth/register.

Controller — A NestJS class that receives HTTP requests and returns responses.

Project example: AuthController handles auth routes.

Service — A class containing business logic, normally called by controllers.

Project example: AuthService handles registration/login logic.

Middleware — Code that runs during request processing.

Project example: It can perform request-level checks.

Guard — A NestJS mechanism that decides whether a request may reach a route.

Project example: A JWT guard can protect /documents.

DTO — Data Transfer Object: a defined shape for incoming/outgoing data.

Project example: RegisterDto can contain name, email and password.

Dependency Injection — A pattern where dependencies are provided to classes instead of created inside them.

Project example: NestJS injects services into controllers.

JSON — A text format for structured data exchange.

Project example: Login requests can be JSON objects.

4. Database & Prisma

PostgreSQL — The relational database management system used by DocuMind.

Project example: It stores users and later documents and related data.

Database Table — A structure containing rows and columns for a data type.

Project example: User is a database table.

Row / Record — One stored item in a table.

Project example: One User row represents one account.

Column / Field — A property stored for each row.

Project example: User.email is a column.

Primary Key — A value that uniquely identifies a row.

Project example: User.id.

Unique Constraint — A database rule preventing duplicate values.

Project example: User.email is unique.

Foreign Key — A field referencing a row in another table.

Project example: Document.userId can reference User.id.

ORM — Object-Relational Mapper; lets application code interact with relational data through programming abstractions.

Project example: Prisma is DocuMind''s ORM.

Prisma — The database toolkit/ORM used by the NestJS backend for PostgreSQL, schema management and migrations.

Project example: NestJS uses Prisma Client to query Users.

Prisma Client — Generated type-safe code used by the application to access the database.

Project example: prisma.user.findUnique(...) can find a user.

Prisma Schema — The file describing database models, relations and enums.

Project example: backend/prisma/schema.prisma.

Migration — A versioned database schema change.

Project example: init_auth created the authentication schema.

Shadow Database — A temporary database used by Prisma to test development migrations.

Project example: Local Prisma provides a shadow connection.

Prisma Studio — A graphical interface for inspecting database records.

Project example: It can show the User table.

5. Authentication & Security

Authentication asks: ''Who are you?'' Authorization asks: ''What are you allowed to do?'' DocuMind needs both.

Authentication — Verifying a user''s identity.

Project example: Login checks email and password.

Authorization — Determining what an authenticated user may do.

Project example: ADMIN and USER roles can later have different permissions.

Credential — Information used to prove identity.

Project example: Email and password.

Password Hash — A transformed representation stored instead of the original password.

Project example: PostgreSQL stores a bcrypt hash.

bcryptjs — A library implementing bcrypt password hashing/comparison.

Project example: Registration hashes passwords; login compares them.

JWT — JSON Web Token: a signed token carrying claims that the server can use to recognize an authenticated user.

Project example: After login the backend returns a JWT.

JWT Payload — The claims/data carried by the JWT.

Project example: The project can include userId and role.

JWT Secret — A server-side secret used to sign/verify JWTs.

Project example: JWT_SECRET belongs only in backend configuration.

Bearer Token — A token sent using the Authorization header as ''Bearer <token>''.

Project example: Authorization: Bearer <JWT>.

401 Unauthorized — The request lacks valid authentication.

Project example: Invalid JWT → 401.

403 Forbidden — The user is authenticated but not allowed to perform the operation.

Project example: A USER accessing an ADMIN-only operation could receive 403.

CORS — Browser security mechanism controlling cross-origin requests.

Project example: It allows the Vite frontend to call the NestJS backend during development.

6. Frontend Authentication

React Router — Frontend routing library.

Project example: /login, /register and /app routes.

Protected Route — A frontend route that requires authentication.

Project example: Unauthenticated users are redirected from /app to /login.

AuthContext — React Context used to share authentication state across components.

Project example: It can hold user, token, loading and isAuthenticated.

Context — React mechanism for sharing values without passing props through every component.

Project example: AuthContext shares the current user.

localStorage — Browser storage that persists data across page refreshes.

Project example: The current plan stores the JWT under documind_token.

Authentication State — The frontend''s current knowledge of the logged-in user and token.

Project example: isAuthenticated can control navigation.

Loading State — Indicates an operation is still running.

Project example: The app can show loading while /auth/me is checked.

Redirect — Automatic navigation from one route to another.

Project example: Successful login redirects to /app.

7. NestJS Concepts

NestJS — A structured TypeScript framework for Node.js server applications.

Project example: DocuMind backend uses NestJS, not Express.

Module — A NestJS unit grouping related controllers/providers/services.

Project example: AuthModule groups authentication components.

Provider — A class/value managed by NestJS dependency injection.

Project example: AuthService can be a provider.

Decorator — TypeScript/NestJS syntax that adds metadata or configuration.

Project example: @Controller and @Get.

Validation Pipe — NestJS mechanism for validating/transformation incoming data.

Project example: It can reject invalid registration input.

Interceptor — NestJS mechanism that can run around request handling.

Project example: Useful later for logging or response transformation.

Exception Filter — NestJS mechanism for standardizing exception handling.

Project example: Can produce consistent API errors.

8. Documents & File Processing

Document Metadata — Information about a document rather than its complete content.

Project example: Name, type, size, owner, status and timestamps.

File Storage — Where the actual uploaded file bytes are stored.

Project example: The database can store metadata while file storage holds the file.

Upload — Sending a file from the browser to the backend/storage system.

Project example: User uploads a PDF.

MIME Type — Standard identifier describing a file''s content type.

Project example: application/pdf.

Text Extraction — Obtaining machine-readable text from a document.

Project example: Extract text from a PDF.

OCR — Optical Character Recognition; converting text in images/scans into machine-readable text.

Project example: Useful for scanned PDFs.

Chunking — Splitting extracted text into smaller pieces.

Project example: Long documents become manageable retrieval chunks.

Processing Status — State describing where a document is in its processing lifecycle.

Project example: UPLOADED → PROCESSING → COMPLETED/FAILED.

Document Ownership — Relationship between a document and its user.

Project example: Document.userId references User.id.

9. Background Processing & Job Queues

Background processing moves slow/heavy work away from the immediate HTTP request. Document processing may involve extraction, OCR, chunking, embeddings and other expensive work.

Synchronous Processing — Work completed during the current request before responding.

Project example: Simple validation.

Asynchronous Processing — Work that continues independently of the immediate request.

Project example: Document processing after upload.

Background Job — A unit of work executed outside the immediate user request.

Project example: Process document #42.

Job Queue — A system storing pending jobs so workers can process them.

Project example: An uploaded document can create a processing job.

Queue — A collection of pending work items.

Project example: Processing jobs wait here.

Worker — A process that takes jobs and performs the work.

Project example: A worker extracts text and creates chunks.

Producer — The component that creates/adds jobs.

Project example: Document service adds a processing job.

Consumer — The component that takes jobs from a queue.

Project example: Document worker consumes processing jobs.

Retry — Attempting a failed job again according to a policy.

Project example: Temporary provider failure can trigger a retry.

Dead-Letter Queue — A place for jobs that repeatedly fail.

Project example: Useful for jobs requiring investigation.

Example: Upload PDF → store metadata/file → create job → worker extracts text → chunks → embeddings → vectors → COMPLETED.

10. AI / RAG

AI Assistant — The conversational DocuMind feature that answers user questions.

Project example: Users ask questions about their documents.

LLM — Large Language Model capable of understanding and generating natural language.

Project example: An LLM generates the final answer.

RAG — Retrieval-Augmented Generation: retrieve relevant information first, then provide it to an LLM to generate a grounded answer.

Project example: Question → retrieve document chunks → LLM → answer.

Retrieval — Finding relevant stored information for a query.

Project example: Find chunks related to the question.

Generation — Producing the final answer using an AI model.

Project example: LLM generates a response.

Context — Information supplied to an AI model for the current request.

Project example: Retrieved document chunks are context.

Prompt — Instructions and information sent to an AI model.

Project example: Question + retrieved context.

System Prompt — High-level instructions controlling model behavior.

Project example: Tell the assistant to use retrieved evidence.

Hallucination — Unsupported or incorrect information generated by an AI model.

Project example: RAG helps ground answers but cannot guarantee zero hallucinations.

Conversation — A sequence of user and assistant messages.

Project example: An AI chat session.

Message — One user or assistant entry in a conversation.

Project example: A question or answer.

11. Embeddings & Vector Search

Embedding — A numerical vector representation of text capturing semantic characteristics.

Project example: A document chunk becomes an embedding.

Vector — A list of numerical values.

Project example: An embedding is a vector.

Vector Store — A system storing embeddings and supporting similarity retrieval.

Project example: Used for RAG retrieval.

Similarity Search — Finding vectors most similar to a query vector.

Project example: Question embedding is compared to document embeddings.

Cosine Similarity — A common measure of similarity based on vector direction.

Project example: Used to compare semantic vectors.

Semantic Search — Search based on meaning rather than exact keywords.

Project example: ''annual vacation'' can relate to ''employee leave''.

pgvector — A PostgreSQL extension providing vector data types and similarity search.

Project example: It can support vector retrieval in PostgreSQL.

12. HTTP & API Reference

HTTP methods

Method

Typical meaning

GET

Retrieve information

POST

Create/submit information

PUT

Replace/update

PATCH

Partially update

DELETE

Delete

Status codes

Code

Meaning

200

Success

201

Created

400

Invalid request

401

Missing/invalid authentication

403

Authenticated but forbidden

404

Not found

409

Conflict, e.g. duplicate email

500

Unexpected server error

13. Environment Variables & Secrets

Environment Variable — Configuration supplied outside source code.

Project example: DATABASE_URL, JWT_SECRET.

.env — Local file commonly used for development environment variables.

Project example: backend/.env.

Secret — Sensitive configuration that must not be exposed.

Project example: JWT_SECRET.

DATABASE_URL — Connection string used by Prisma to reach PostgreSQL.

Project example: The local Prisma development environment provides the connection.

VITE_API_URL — Frontend environment variable containing the backend API base URL.

Project example: http://localhost:3000 during development.

Never put private backend secrets such as JWT_SECRET into VITE_ variables because frontend variables can be exposed to the browser.

14. Development Workflow

Current local development uses three VS Code terminals:

Terminal 1: npx prisma dev

Terminal 2: cd backend → npm run dev

Terminal 3: cd frontend → npm run dev

No Docker or separately opened PostgreSQL application is required for this local Prisma setup.

Recommended development style: build features with frontend and backend contracts aligned, and connect to real data rather than relying on fake authentication or fake database behavior.

15. Authentication Flow — Full Explanation

This section is the detailed reference for the authentication concepts used in DocuMind.

15.1 What are we building?

We want DocuMind to know who is using the application. A user opens the Welcome page, chooses Login or Register, authenticates, and then enters the protected Main Application. The Dashboard is only one feature inside the Main Application.

15.2 Authentication vs Authorization

Authentication = WHO are you? Authorization = WHAT are you allowed to do?

Example: a USER can manage their documents, while an ADMIN may later have additional management permissions.

15.3 Why React cannot directly access PostgreSQL

The browser is not a trusted environment. Database credentials must not be exposed. Therefore:

React → NestJS API → Prisma → PostgreSQL

15.4 Registration flow

1. User enters name, email and password in React.

2. React sends POST /api/auth/register.

3. NestJS AuthController receives the request.

4. AuthController delegates business logic to AuthService.

5. AuthService checks whether the email already exists.

6. bcryptjs hashes the password.

7. Prisma creates the User row in PostgreSQL.

8. The backend can generate a JWT after successful registration.

9. React receives the response and updates AuthContext.

10. React navigates to /app.

15.5 Login flow

1. User enters email and password.

2. React sends POST /api/auth/login.

3. NestJS AuthController receives the request.

4. AuthService asks Prisma to find the user.

5. bcryptjs compares the entered password with the stored hash.

6. If valid, the backend signs a JWT.

7. Backend returns the JWT and safe user information.

8. React stores the token and updates AuthContext.

9. React navigates to /app.

15.6 What is JWT?

JWT means JSON Web Token. Think of it as a signed digital ID. After successful login, the server gives the frontend a token. On later protected requests, the frontend sends that token so the backend can identify the authenticated user without asking for the password again.

Login → verify credentials → create JWT → frontend stores token → later requests include the JWT.

15.7 What is the JWT payload?

The payload is the information carried by the token. The project can include:

userId: 1role: "USER"

The password must never be placed in the JWT.

15.8 What is JWT_SECRET?

JWT_SECRET is a private server-side value used to sign and verify JWTs. It belongs in backend environment configuration and must never be exposed to the frontend.

15.9 What is the Authorization header?

Protected requests can send:

Authorization: Bearer <JWT>

The word Bearer tells the server that the following value is the access token.

15.10 What is /auth/me?

After a browser refresh, React may need to know which user is logged in. It can send GET /api/auth/me with the JWT. The backend verifies the JWT, finds the user with Prisma and returns safe user information.

15.11 What is AuthContext?

AuthContext is the frontend''s central authentication state. It can hold the current user, token, loading state and isAuthenticated value so components such as the sidebar and route protection can use the same authentication information.

15.12 What is ProtectedRoute?

ProtectedRoute is a frontend navigation guard. It prevents unauthenticated users from entering /app through normal frontend navigation. It is NOT the real security boundary; the backend must also verify JWTs.

15.13 What is a NestJS Guard?

A NestJS Guard decides whether a request is allowed to reach a route handler. A JWT guard can verify authentication before protected backend endpoints such as /documents.

15.14 Complete authentication architecture

Browser / React

↓

POST /api/auth/login

↓

NestJS AuthController

↓

AuthService

↓

Prisma Client

↓

PostgreSQL User table

↓

bcrypt password verification

↓

JWT generated

↓

React AuthContext

↓

/app

15.15 Why use both frontend and backend protection?

ProtectedRoute improves the user experience by redirecting unauthenticated users. It cannot be trusted as the sole security mechanism because browser code can be manipulated. The backend JWT guard/middleware is the authoritative protection for sensitive API operations.

16. Quick Reference

Term

Remember it as

Prisma

Tool/ORM connecting NestJS code to PostgreSQL.

PostgreSQL

Where persistent relational data is stored.

NestJS

Our backend framework.

API

Communication interface between frontend and backend.

JWT

Signed digital authentication token.

bcryptjs

Hashes and verifies passwords.

AuthContext

Frontend authentication state manager.

ProtectedRoute

Frontend route protection.

Guard

NestJS backend route-access decision.

Job Queue

Waiting line for background work.

Worker

Process that performs queued jobs.

RAG

Retrieve relevant content, then generate an answer using that context.

Embedding

Numerical representation of text for semantic comparison.

Vector Search

Find semantically similar stored vectors.

Current DocuMind Milestone

The local Prisma PostgreSQL environment is working. The User model and authentication migration exist. The frontend has a public Welcome page, authentication pages and a protected Main Application architecture. The next objective is to make authentication work end-to-end with real PostgreSQL data, then implement document management, document processing, retrieval and the AI Assistant.', NULL, 69, NULL, '2026-09-03T14:58:35.139Z', '2026-09-03T14:58:35.574Z');

-- Resync sequences to max(id) so future inserts don't collide
SELECT setval(pg_get_serial_sequence('"User"', 'id'), COALESCE((SELECT MAX(id) FROM "User"), 1));
SELECT setval(pg_get_serial_sequence('"Category"', 'id'), COALESCE((SELECT MAX(id) FROM "Category"), 1));
SELECT setval(pg_get_serial_sequence('"Document"', 'id'), COALESCE((SELECT MAX(id) FROM "Document"), 1));

COMMIT;