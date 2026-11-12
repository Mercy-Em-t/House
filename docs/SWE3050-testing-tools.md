# SWE 3050 Groupwork
## Part 2: Software Testing Tools Selection and Evaluation

### Case Study: House - Virtual Workspace

## Scope and test targets

Part 1 describes **House - Virtual Workspace** as a browser-based,
real-time collaborative application. It has two closely related system
targets that should be tested together:

1. **House web application:** the React/Vite frontend, Node.js/Express
   backend, authentication, REST APIs, Socket.IO events, world engine,
   avatars, chat, and monetisation flows.
2. **Rust real-time runtime:** the optional WebSocket service in
   `realtime-rs`, including its bridge and shared protocol. It must remain
   compatible with the Node orchestration layer and browser clients.

This distinction allows the report to evaluate tools against both systems
without claiming that the repository contains a second unrelated application.

## Question 1: Types of software testing tools

Testing tools are commonly classified by the testing activity they support.
No single tool replaces all other tools: a test-management product may
organise work, while a unit framework executes code-level checks and a load
tool measures runtime behaviour.

### 1. Test management tools

**Definition and purpose.** Test management tools plan, organise, assign,
trace, monitor, and report testing work. They store test cases, test suites,
requirements, execution results, and evidence.

**Examples.** TestRail and Zephyr (for Jira) are widely used examples.
PractiTest is another commercial option.

**Use for House.** A House test repository could contain suites for
authentication, room movement, chat visibility, AI-agent endpoints, runtime
mode compatibility, and browser regression. Each test can be linked to a
requirement, defect, build, and execution result. This is especially useful
when the same acceptance tests must run against both Node and Rust runtime
modes.

### 2. Functional testing tools

**Definition and purpose.** Functional testing tools check whether features
produce the specified outputs for valid and invalid inputs. They execute
repeatable user or API scenarios and compare actual results with expected
results.

**Examples.** Playwright and Selenium WebDriver support browser functional
testing. Cypress is another modern browser-focused option.

**Use for House.** Playwright can register and log in a user, load the
workspace, move an avatar, change rooms, send room/proximity/global
messages, and verify that the correct users receive each message. API
requests can also verify registration, login, JWT validation, and AI-agent
authorization. The same functional scenarios should be repeated with
`RUNTIME_MODE=node`, `hybrid`, and `rust` where the feature is supported.

### 3. Unit testing tools

**Definition and purpose.** Unit testing tools execute small tests against
individual functions or modules in isolation, using controlled inputs and
mocked dependencies where necessary. They find logic defects early and make
failures easier to diagnose.

**Examples.** Node.js has a built-in `node:test` runner, and Jest and Vitest
are popular alternatives. Rust projects commonly use the built-in Rust test
framework with `cargo test`.

**Use for House.** The current backend already uses Node's test runner for
world boundaries, room lookup, proximity, avatar commands, chat history,
authentication, and payment settlement. More unit tests can cover JWT
failure cases, rate-limit behaviour, protocol validation, and runtime
adapters. `cargo test` should check Rust coordinate handling, WebSocket event
encoding, bridge authentication, and compatibility with
`shared/protocol/v1.json`.

### 4. Performance and load testing tools

**Definition and purpose.** Performance and load tools measure response time,
throughput, resource use, concurrency, scalability, and stability under
expected or exceptional workloads.

**Examples.** k6 and Apache JMeter are common choices. Gatling and Locust
are also suitable alternatives.

**Use for House.** k6 can create many WebSocket clients that connect,
authenticate, send avatar intents, and receive snapshots. The repository
already includes `quality/qct/load-k6.js`, which tests WebSocket upgrades and
repeated movement intents. HTTP scenarios should also measure login, world
state, chat, and AI-agent endpoints. Results should compare Node and Rust
runtime modes using latency percentiles, connection success rate, message
loss, CPU, and memory rather than relying only on average response time.

### 5. Security testing tools

**Definition and purpose.** Security testing tools identify vulnerabilities,
misconfiguration, insecure dependencies, weak authentication, injection
paths, and unintended information exposure.

**Examples.** OWASP ZAP performs dynamic web and API scanning, while
Snyk and npm audit identify vulnerable dependencies. Burp Suite is another
option for interactive security testing.

**Use for House.** OWASP ZAP can scan the Express API and frontend for
injection, broken access control, insecure headers, and unintended endpoint
exposure. Tests should verify that invalid or expired JWTs are rejected,
`X-Agent-Key` cannot be bypassed, rate limits work, CORS is restricted, and
chat content is safely handled. Dependency scanning should cover both npm
lockfiles and the Rust dependency graph. Development secrets shown in
configuration must never be used in production.

### 6. Defect/bug tracking tools

**Definition and purpose.** Bug trackers record, prioritise, assign, discuss,
and close defects while preserving history and evidence.

**Examples.** GitHub Issues and Jira are widely used. Linear and YouTrack
are other options.

**Use for House.** A defect should include runtime mode, browser or client
version, reproduction steps, expected and actual results, logs, screenshots
where appropriate, severity, and a link to the failing test. GitHub Issues
fits this repository because code, pull requests, test changes, and defect
discussion can remain connected in one platform.

### 7. Continuous integration and testing tools

**Definition and purpose.** CI tools automatically build software and run
quality checks for each commit or pull request. They provide an early,
repeatable quality gate before changes are merged.

**Examples.** GitHub Actions and GitLab CI/CD are common choices. Jenkins is
an established self-hosted alternative.

**Use for House.** A GitHub Actions pipeline should install backend and
frontend dependencies, run `npm test`, run `npm run build`, and run Rust
formatting, compilation, and tests. A service-level job can start the
backend and execute API/browser smoke tests. Load and security scans can run
on a schedule because they are more expensive than pull-request unit tests.
The pipeline should test the shared protocol and, where available, each
runtime mode.

### 8. Mobile application testing tools

**Definition and purpose.** Mobile testing tools test native, hybrid, or
responsive applications across mobile operating systems, screen sizes,
devices, browsers, and network conditions.

**Examples.** Appium and BrowserStack are widely used. Sauce Labs and
Firebase Test Lab are alternatives.

**Use for House.** House is currently a browser application rather than a
native mobile app, so this category is not a first-priority purchase.
Responsive browser tests can nevertheless use BrowserStack or a similar
device cloud to check touch controls, Canvas rendering, keyboard
availability, orientation, chat layout, and WebSocket reconnection on
Android and iOS browsers. Appium becomes appropriate if a native wrapper is
introduced later.

### 9. API testing tools

**Definition and purpose.** API testing tools send requests to REST,
WebSocket, or other service interfaces and verify status codes, headers,
schemas, authentication, ordering, and error handling.

**Examples.** Postman and Newman support interactive and command-line API
collections. Insomnia and REST Assured are other choices.

**Use for House.** A collection should cover `/api/auth`, world endpoints,
AI-agent endpoints, monetisation routes, and the Rust bridge. Tests should
check valid requests, malformed JSON, missing fields, duplicate accounts,
expired tokens, unauthorized agent keys, rate limits, and stable response
schemas. WebSocket checks should verify connection, avatar intent,
world snapshots, room history, and disconnect behaviour.

### 10. Test automation frameworks

**Definition and purpose.** Test automation frameworks provide reusable
structure, fixtures, assertions, data handling, setup/teardown, reporting,
and execution conventions for automated regression tests. A framework is
broader than one test script and may combine browser, API, and unit
capabilities.

**Examples.** Playwright Test and Cypress provide browser automation
frameworks; Robot Framework provides keyword-driven automation. Jest and
Vitest provide JavaScript test-framework features.

**Use for House.** Playwright Test can provide fixtures for a running
backend, authenticated browser contexts, seeded users, and clean room
state. Data-driven cases can exercise multiple chat types, invalid
credentials, browsers, and runtime modes. Reusable helpers reduce the cost
of regression testing movement, room membership, chat routing, and
reconnection.

## Recommended tool combination

For the current repository, a practical and cost-conscious combination is:

| Need | Recommended tool | Reason |
|---|---|---|
| Backend and Rust unit tests | Node `node:test` and `cargo test` | Already aligned with the codebase; fast and low cost |
| Browser and end-to-end tests | Playwright Test | Covers Chromium, Firefox, WebKit, API requests, traces, and parallel runs |
| API checks | Postman/Newman or Playwright API testing | Repeatable REST checks in local and CI environments |
| WebSocket load | k6 | Existing k6 asset and good virtual-user support |
| Security checks | OWASP ZAP plus npm audit/Snyk | Dynamic scanning combined with dependency analysis |
| CI | GitHub Actions | Native integration with the repository and pull requests |
| Test management and defects | GitHub Issues plus a test-management tool if the team grows | Minimal overhead now, traceability at larger scale |

Commercial tools such as BrowserStack, TestRail, Snyk, or Sauce Labs may
improve device coverage, reporting, or support, but their cost should be
justified by project risk and team size. Open-source tools are sufficient for
the current prototype if the team can maintain the test infrastructure.

## Question 2: Factors to consider when selecting a testing tool

### i. Project requirements

The tool must test the actual risks in House: authentication, spatial
movement, real-time events, room and proximity rules, chat routing,
AI-agent APIs, payment-related behaviour, and runtime compatibility. A
browser-only tool cannot replace API, unit, WebSocket, load, or security
testing. The Rust runtime also requires tools that can inspect a WebSocket
protocol rather than only click web controls.

### ii. Compatibility

The selection must support Node.js 18+, React/Vite, Express, Socket.IO,
WebSocket, Rust, JSON, and the browsers and operating systems used by the
team. It should work with the repository's npm and Cargo workflows and
support Chromium, Firefox, and WebKit where browser differences matter.
Mobile browser coverage is useful because Canvas, touch input, and
WebSocket behaviour may vary by device.

### iii. Cost and licensing

Open-source tools reduce licence fees but may require engineering time for
hosting, maintenance, dashboards, and upgrades. Commercial tools can provide
device farms, support, analytics, and easier scaling but may charge per user,
test run, parallel worker, or device minute. The total cost includes
training, CI minutes, storage for traces and videos, and future scale. For
this project, built-in Node/Rust tests, Playwright, k6, GitHub Actions, and
OWASP ZAP provide a strong baseline before adding paid services.

### iv. Ease of use and learning curve

The tool should be usable by developers and QA members with different
experience levels. Clear documentation, readable failures, local debugging,
trace capture, and IDE integration reduce the time needed to diagnose a
failure. A powerful tool that the team cannot use consistently is less
valuable than a simpler tool that runs on every change.

### v. Team skills and expertise

The team already works with JavaScript, Node.js, React, Rust, Git, and k6
assets. Node's test runner and Playwright therefore minimise new training.
If a commercial test-management or security product is selected, the team
must budget for onboarding, ownership of test data, and maintenance of
credentials and environments.

### vi. Integration capabilities

Tools should integrate with GitHub, pull requests, GitHub Actions, npm,
Cargo, issue tracking, and test-result formats such as JUnit XML. They
should support linking a failed test to a commit and defect. Integration
with logs, traces, screenshots, and the existing QCT checklists is valuable
for diagnosing intermittent real-time failures.

### vii. Automation support

The preferred tools should automate repetitive regression tests and support
fixtures, parameterised/data-driven cases, setup and teardown, parallel
execution, retries with care, and environment configuration. They should
also support API and WebSocket setup so that a browser test does not have to
perform every prerequisite through the UI. Automation must remain
deterministic; careless retries can hide real timing or message-loss bugs.

### viii. Reporting and analytics

Useful reports show pass/fail status, duration, trends, flaky tests,
coverage of requirements, failure traces, and links to defects. For House,
performance reports should include p50, p95, and p99 latency, throughput,
connection failures, dropped messages, and resource usage. Security reports
should identify severity and remediation guidance rather than merely listing
URLs.

### ix. Vendor support and community

The team should assess update frequency, documentation quality, issue
response, release stability, and the size of the user community. Open-source
tools need an active project and a practical support path. Vendor lock-in,
export formats, and the ability to run tests locally should be considered
before committing critical test evidence to a hosted service.

### x. Scalability and future growth

The tool must support more rooms, avatars, messages, browsers, test cases,
and runtime modes as House evolves toward persistence, voice/video, 3D
rendering, and production deployment. It should support parallel CI workers,
distributed load generation, reusable test data, and historical reporting.
The team should avoid selecting a tool that works only for a small local
prototype or one browser.

### xi. Reliability and stability

Tests must fail because the product is defective, not because the tool is
inconsistent. Selection should consider test isolation, deterministic
timing, WebSocket support, version compatibility, retry behaviour, and
diagnostic evidence. Mature, widely adopted tools reduce operational risk,
but even mature tools need pinned versions, clean test data, monitored CI
jobs, and periodic review of flaky tests.

## Conclusion

House needs a layered testing strategy rather than one automation product.
Unit tests protect world, avatar, authentication, chat, payment, and protocol
logic; API and functional tests protect observable behaviour; Playwright
checks the browser experience; k6 measures real-time capacity; security tools
protect the API and dependencies; and GitHub Actions makes the checks
repeatable. The optional Rust runtime should be tested against the same
protocol and acceptance behaviour as the Node runtime.

The recommended initial selection is therefore **Node `node:test` and
`cargo test`, Playwright Test, k6, OWASP ZAP, npm audit, and GitHub Actions**,
with GitHub Issues for defect tracking. A dedicated commercial test-management
or device-cloud product should be added only when traceability, mobile
coverage, team size, or release risk justifies its recurring cost.

## Sources

The category descriptions and selection principles were informed by the
required reading:

* Guru99, “Why the Right Automation Testing Tools Are Necessary for Testing
  Success”:
  <https://www.guru99.com/testing-automation-why-right-tools-are-necessary-for-testing-success.html>
* Software Testing Help, “Automation Testing Tutorial”:
  <https://www.softwaretestinghelp.com/automation-testing-tutorial-4/>
* House repository documentation and quality assets:
  `README.md`, `docs/SWE3050-house-case-study.md`,
  `backend/src/house.test.js`, and `quality/qct/load-k6.js`.
