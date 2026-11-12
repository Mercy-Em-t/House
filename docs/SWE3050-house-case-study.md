# SWE 3050 Groupwork
## Part 1: Software Background and Overview

### Case Study: House – Virtual Workspace

**Prepared by:** [Group name / members]  
**Course:** SWE 3050  
**Date:** [Submission date]

## Executive Summary

House – Virtual Workspace is a browser-based, real-time multi-user virtual
workspace. Users enter a digital building as avatars, move between rooms,
communicate through room, proximity, and global chat, and interact with
external AI agents. The project is technically significant because it combines
authentication, real-time networking, spatial world logic, a web interface, and
an optional Rust runtime in one system.

This report is based on the source repository, its README, package manifests,
source structure, and Git history. Where the repository does not provide legal
or organizational information, that limitation is stated rather than assumed.

## i) Name of the Software/Application

The official project name shown in the repository is **House – Virtual
Workspace**. The repository and package names also use **House**. “House”
describes the software metaphor: users occupy a shared digital building
containing a lobby, offices, meeting rooms, a lounge, and an AI hub.

The project is not simply a file-sharing or messaging application. Its central
concept is embodied presence: each participant is represented by an avatar
whose location and state are visible to other users.

## ii) Developers of the Software

The Git history identifies **Mercy Tryphen** as the recorded contributor and
author of the available repository history. The repository is hosted under the
GitHub account/organization **Mercy-Em-t**. The available evidence does not
identify a larger formal development team, so the project should be described
as an individually maintained or small-team project unless the group confirms
additional contributors.

The implementation contains several responsibility areas:

* **Application/backend development:** Node.js and Express routes handle
  authentication, world management, AI integration, monetization, and
  orchestration.
* **Real-time systems development:** Socket.IO handles the Node real-time
  mode, while `realtime-rs` provides an optional Rust WebSocket runtime.
* **Frontend development:** React components and an HTML5 Canvas renderer
  provide authentication, world display, avatar controls, chat, and settings.
* **Quality/testing:** Backend tests cover world, avatar, chat, and
  authentication behavior; the `quality/qct` directory contains latency,
  load, and consistency test assets.

These roles are inferred from the repository structure. The group should add
the actual names and role assignments of any classmates who contributed to the
software.

## iii) Type of Software and Application Area

House is **application software**, specifically a **web-based real-time
collaborative virtual workspace**. It runs in a browser and uses a client-
server architecture:

* The frontend is a React/Vite web application.
* The backend is a Node.js/Express server.
* Socket.IO/WebSocket communication synchronizes users and world state.
* An optional Rust service supports hybrid or Rust-first real-time operation.

The main application area is **collaboration and virtual workplaces**. It can
support distributed teams, online communities, virtual events, remote
meetings, learning spaces, or other environments where users need both
communication and a sense of location.

The target users are:

1. Individuals joining a shared virtual workspace.
2. Teams and organizations conducting remote collaboration.
3. Administrators or platform operators managing rooms and users.
4. External AI systems that connect through the AI-agent API.

Important user-facing functions include JWT-based registration and login,
avatar movement, room membership, proximity detection, room/proximity/global
chat, world-state synchronization, and AI-controlled avatars.

## iv) Owners of the Software

The public GitHub repository is owned or controlled by **Mercy-Em-t**, and the
repository's recorded contributor is Mercy Tryphen. This establishes
repository stewardship, but it does not by itself prove the complete legal
copyright ownership of every contribution.

No `LICENSE` file or SPDX license is present in the repository metadata. The
software should therefore be treated as **unlicensed/proprietary by default**
for redistribution purposes unless the owner supplies a separate written
license or confirms another arrangement. Public visibility on GitHub does not
automatically grant permission to copy, modify, or commercially distribute the
code.

For the class report, the group should confirm:

* Whether Mercy Tryphen is the sole copyright owner or whether ownership is
  shared with other contributors.
* Whether the software was created as a student project, an independent
  project, or an institutional/company project.
* Whether a formal open-source license will be added.

## v) Development History and Context

### 1. Development timeline

The GitHub repository was created on **9 April 2026**, and the latest available
repository update is **12 November 2026**. The first recorded repository
history includes a merge of a branch named
`copilot/create-virtual-workspace`, indicating that the virtual-workspace
concept was implemented during that development period.

The repository does not provide a separate requirements document or a
milestone-by-milestone history. Therefore, the exact date of initial
conceptualization, individual feature releases, and production deployment
cannot be verified from the available artifacts.

### 2. Programming languages and frameworks

The system uses a polyglot technology stack:

| Area | Technologies |
|---|---|
| Frontend | JavaScript, React 18, React DOM, Vite, HTML5 Canvas, CSS |
| Backend | JavaScript, Node.js 18+, Express 4 |
| Real-time communication | Socket.IO 4 and WebSocket support |
| Authentication/security | JSON Web Tokens, bcryptjs, CORS, rate limiting |
| Optional runtime | Rust 2024, Tokio, Axum, Serde |
| Shared contracts | JavaScript and JSON protocol definitions |
| Testing/quality | Node’s test runner, k6 load-test asset, latency and consistency checklists |

### 3. Development environment

The repository uses **Git and GitHub** for version control and collaboration.
The backend and frontend each have an npm package manifest and lockfile.
Vite provides the frontend development server and build process; Node.js
provides the backend runtime; Cargo manages the Rust real-time service.

The documented local development workflow uses:

* Node.js version 18 or later.
* `npm install` for backend and frontend dependencies.
* `npm run dev` for the backend and frontend development servers.
* `cargo run` for the optional Rust service.
* A browser to access the frontend at the documented local development URL.

The repository does not mandate a particular IDE. Visual Studio Code or
another JavaScript/Rust-capable IDE could be used, but that should not be
presented as a verified project requirement.

### 4. Circumstances of development

The project addresses limitations of conventional remote collaboration tools.
Text chat and video meetings often provide communication but not a shared
sense of place, movement, or informal interaction. House was designed around a
digital building where users can see avatars, enter rooms, communicate with
nearby participants, and interact with AI agents.

The architecture also responds to an engineering need for scalable real-time
behavior. The Node.js implementation provides the default runtime, while the
hybrid/Rust option allows the real-time layer to evolve independently. A
shared protocol enables Node, Rust, and clients to exchange compatible world
state and events.

The repository does not explicitly state whether the initial requirement came
from a client, a company, or an academic sponsor. Based on its public
repository structure and recorded history, it can currently be described as an
independently developed software project; the group should replace this
description if it has direct project documentation showing a different origin.

### 5. Purpose and objectives

The primary purpose of House is to provide an interactive virtual workspace
with real-time social and collaborative features. Its objectives are to:

1. Allow authenticated users to enter a shared virtual building.
2. Represent users as movable avatars with synchronized positions and states.
3. Organize interaction by physical or logical rooms.
4. Support room-based, proximity-based, and global communication.
5. Detect nearby avatars to enable spatial interaction.
6. Expose a controlled API for spawning and commanding AI avatars.
7. Provide a runtime architecture that can progress from a Node.js
   implementation to a hybrid or Rust-based real-time service.
8. Maintain a 3D-ready coordinate model so that a future 3D renderer or Unity
   client can reuse the world and communication model.

The current implementation uses in-memory storage, so it is best understood as
a functional prototype or evolving platform foundation rather than a complete
enterprise deployment. The documented roadmap identifies persistent database
storage, voice/video communication, richer avatars, 3D rendering, an admin
dashboard, monetization, and business integrations as future extensions.

## Conclusion

House – Virtual Workspace is a strong SWE 3050 case study because it
demonstrates a complete modern software system rather than a single isolated
programming exercise. It combines frontend engineering, backend APIs,
authentication, real-time distributed state, spatial rules, automated testing,
and cross-language runtime design. Its main documentation gap is not
technical: the group should obtain and add authoritative information about
the human development team, the original requirements, and the legal
ownership/licensing arrangement before final submission.

## Sources within the repository

* `README.md` — product description, features, architecture, setup, APIs,
  tests, and roadmap.
* `package.json` — project scripts and top-level tooling.
* `backend/package.json` — backend runtime and dependencies.
* `frontend/package.json` — frontend runtime and dependencies.
* `realtime-rs/Cargo.toml` — Rust runtime language edition and dependencies.
* `backend/src/`, `frontend/src/`, `shared/protocol/`, and `quality/qct/` —
  implementation and quality-assurance structure.
* GitHub repository metadata and Git history — repository owner, dates, and
  recorded contributor information.
