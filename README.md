# marko

A desktop Markdown workspace that blends a Typora-style editor with a project graph.

## Features

- Markdown editing powered by Milkdown + CodeMirror.
- Graph view built on React Flow for navigating relationships.
- Tabs, recent projects, and theme switching.
- Tauri desktop app (Windows/macOS/Linux).

## Tech Stack

- React 19 + Vite + TypeScript
- Tauri 2 (Rust)
- Milkdown, CodeMirror 6
- React Flow, Zustand, Radix UI, Tailwind CSS

## Development

```bash
pnpm dev
```

## Desktop (Tauri)

```bash
pnpm dev:desktop
```

## Build

```bash
pnpm build
```
