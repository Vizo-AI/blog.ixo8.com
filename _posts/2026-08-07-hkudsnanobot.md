---
title: "HKUDS/nanobot"
date: 2026-08-07
layout: post
---

# HKUDS/nanobot

**Imagine a personal AI that lives on your laptop, remembers every conversation, calls out to the tools you already use, and can even run a tiny team of specialized agents — all without leaving your own network.**  

That’s not a sci‑fi fantasy. It’s exactly what the **HKUDS/nanobot** project delivers: an ultra‑lightweight, open‑source, self‑hosted personal AI agent framework written in Python. It comes with a built‑in WebUI, tool‑registration hooks, memory persistence, an MCP (Model‑Control‑Protocol) layer, multi‑agent workflow support, automation scripts, and pluggable chat adapters. In short, it’s a ready‑made chassis for building *any* AI assistant you can imagine — from a grammar‑checking “Catbot” to a full‑blown research aide.

---

### Why a self‑hosted framework matters

1. **Data stays yours** – No API keys, no third‑party servers. Sensitive context lives on your machine.  
2. **Zero vendor lock‑in** – You own the code, the model, the upgrade path.  
3. **Extensibility by design** – Add a new tool by dropping a Python function into the MCP registry; the framework auto‑wires it to every agent that needs it.  
4. **Lightweight footprint** – A few megabytes of dependencies, no Docker daemon required, and it runs on any OS that supports Python 3.9+.  

These first‑principles advantages are why researchers, indie developers, and even small teams are gravitating toward nanobot when they need a “personal AI” that feels truly personal.

---

### The recent 4‑hour Agentic AI Engineering workshop

Last week I ran a **full‑scale, hands‑on workshop** titled *“Agentic AI Engineering: MCP, CrewAI, OpenAI Agent SDK.”* The session walked participants through:

- **Model‑Control‑Protocol (MCP)** – a simple JSON‑over‑HTTP contract for exposing any Python function as a callable tool.  
- **CrewAI** – a lightweight orchestration layer that lets you declare a hierarchy of agents, assign them roles, and let them pass state via shared memory.  
- **OpenAI Agent SDK** – for those who still want to tap into GPT‑4‑level reasoning while keeping the surrounding workflow fully self‑hosted.

The workshop culminated in a live demo where each participant deployed a **custom “Catbot”** into nanobot’s WebUI. Catbot was entered in DEV’s Summer Bug Smash (a Sentry‑powered bug‑fixing competition) and solved a subtle grammar‑parsing edge case that had tripped up larger language models. Within nanobot, Catbot:

1. **Registered its `check_grammar` function as an MCP tool.**  
2. **Gained a persistent memory slot** to store user‑specific style guides.  
3. **Started a chat session** through the WebUI, where it could ask clarifying questions, call external spell‑checking APIs, and even hand off to a “Proofreader” agent when confidence was low.

Seeing a single Python file become a fully interactive, memory‑aware, multi‑agent participant in seconds was a light‑bulb moment for everyone in the room.

---

### Takeaway: Build, own, iterate

If you’re looking to move beyond “chat‑only” AI experiences and into **real‑world automation**, nanobot gives you the scaffolding to:

- **Create modular agents** that can be swapped, versioned, and tested independently.  
- **Compose workflows** where one agent’s output becomes another’s input, enabling planning‑execution‑reflection loops.  
- **Expose any Python library** (from Selenium to Pandas) as a first‑class tool without writing wrapper code.  

Because the entire stack is open source and community‑driven, you can fork it, add features, or contribute bug‑fixes back — turning a personal experiment into a collaborative platform.

---

### Next steps

- **Grab the repo**: `git clone https://github.com/HKUDS/nanobot.git`  
- **Spin up the WebUI**: `python -m nanobot.ui` – you’ll see a minimal chat window ready for your first tool.  
- **Join the community**: We have a Discord channel and a weekly “Agent‑Design” livestream where developers share patterns and troubleshoot together.  
- **Reserve a seat** for the next 4‑hour workshop (dates announced on the repo’s README). It’s a hands‑on deep dive into MCP, CrewAI, and the OpenAI Agent SDK — exactly the kind of training that turns a curious coder into an AI‑agent architect.

The future of AI isn’t just about bigger models; it’s about smarter *orchestration* and *ownership*. With HKUDS/nanobot you get both, in a package that fits on a laptop and scales to a team. Let’s build the next generation of personal agents — together.

*If you’re excited about self‑hosted AI agents, drop a comment below or ping me directly. I’d love to hear what you’d build on top of nanobot.*
