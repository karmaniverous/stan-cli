---
title: Getting Started
---

# Getting Started

Follow these fundamental steps to start using STAN.

## 1. Set up a STAN agent

The STAN workflow requires an assistant configured with the "bootloader" prompt, which allows it to read your `archive.tar` and load the project's system prompt securely.

### For the best experience (TypingMind)

We recommend **TypingMind** for its superior support of long, stable system prompts and convenient UI features.

1.  **Get TypingMind:** Purchase a license (Extended or Premium recommended) at [typingmind.com](https://www.typingmind.com).
2.  **Configure API Keys:** Set up your OpenAI or Google Gemini API keys in TypingMind settings.
3.  **Import a STAN Character:**
    - **GPT-5.2:** [Import Character](https://www.typingmind.com/characters/c-01KDYW9NG2KGMFN7FTC4MHRSKB)
    - **Gemini 3 Pro:** [Import Character](https://cloud.typingmind.com/characters/c-01KFDNC35WZA1D54K299RE28T3)

### ChatGPT Users

- **Custom GPT:** Use the [STAN Custom GPT](https://chatgpt.com/g/g-68d2b8b25c248191bf4f2a5c04018527-stan).
- **Manual Setup:** Alternatively, create a new Project and copy the contents of the [bootloader prompt](https://github.com/karmaniverous/stan-core/blob/main/.stan/system/stan.bootloader.md) into the project instructions.

### Google Gemini Users

- **Custom Gem:** Use the [STAN Gem](https://gemini.google.com/gem/12yH0pH-5Mt_A4GmLbzh0vwMLA2nOIqKj).
  - _Note:_ Code blocks in the Gemini web app can be difficult to copy correctly; TypingMind is preferred for Gemini models.

---

## 2. Install & run STAN

Prepare your repository for AI-assisted development.

### Install

Install the CLI globally:

```bash
npm i -g @karmaniverous/stan-cli
```

### Initialize

In your repository root, initialize STAN. During initialization, you will be prompted to select key scripts (like `test`, `lint`, `typecheck`, `build`) to include in the context.

```bash
stan init
```

### Run the loop

1.  **Run:** Execute `stan run` to build/test and generate context. Commit your changes (save the state).
2.  **Snap:** Execute `stan snap` to baseline diffs.
3.  **Share:** Drop the artifacts into chat:
    *   New thread: `archive.tar` + outputs.
    *   Existing thread: `archive.diff.tar` + outputs.
4.  **Patch:** Discuss with the agent. It will generate patches. Apply them with `stan patch`.

*Return to **Run** to verify.*

See [The STAN Loop](./the-stan-loop.md) for details on the development cycle.
