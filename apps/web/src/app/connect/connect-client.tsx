"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TOOL_CATALOG } from "@/mcp/tool-catalog";

type ToolRow = { name: string; description: string };

export function ConnectClient() {
  const [tools, setTools] = useState<ToolRow[]>(
    TOOL_CATALOG.map((t) => ({
      name: t.name,
      description: t.description,
    }))
  );

  useEffect(() => {
    void fetch("/api/agents/tools")
      .then((r) => r.json())
      .then((data: { tools?: ToolRow[] }) => {
        if (data.tools?.length) setTools(data.tools);
      })
      .catch(() => {
        /* keep static list */
      });
  }, []);

  return (
    <div className="sigma-connect">
      <div className="sigma-connect-bg" aria-hidden />
      <header className="sigma-connect-header">
        <Link href="/" className="sigma-brand sigma-connect-brand">
          <span className="sigma-logo" aria-hidden />
          <div>
            <div className="sigma-brand-name">SigmaDesign</div>
            <div className="sigma-brand-tag">Agents · local library access</div>
          </div>
        </Link>
        <div className="sigma-home-actions">
          <Link href="/" className="sigma-btn sigma-btn-ghost">
            Library
          </Link>
          <a
            className="sigma-btn sigma-btn-primary"
            href="/skills/sigmadesign-implement.zip"
            download="sigmadesign-implement.zip"
          >
            Download skill zip
          </a>
        </div>
      </header>

      <main className="sigma-connect-main">
        <section className="sigma-connect-hero">
          <p className="sigma-connect-kicker">For coding agents on your machine</p>
          <h1>Connect agents to your designs</h1>
          <p className="sigma-connect-lead">
            Run a local agent server against your private{" "}
            <code>.sig</code> library — list files, pull design context, export
            structure, and even apply small edits — without third-party design
            cloud seats or rate limits.
          </p>
          <div className="sigma-connect-cta-row">
            <a
              className="sigma-btn sigma-btn-primary"
              href="/skills/sigmadesign-implement.zip"
              download="sigmadesign-implement.zip"
            >
              Download implement skill (.zip)
            </a>
            <a className="sigma-btn sigma-btn-ghost" href="#setup">
              Setup instructions
            </a>
          </div>
        </section>

        <section id="setup" className="sigma-connect-card">
          <h2>1. Start the agent server</h2>
          <p>
            From the SigmaDesign repo root (with dependencies installed):
          </p>
          <pre className="sigma-connect-code">{`pnpm mcp`}</pre>
          <p className="sigma-connect-muted">
            Optional: set <code>SIGMADESIGN_HOME</code> if your library is not
            under <code>~/.sigmadesign</code>.
          </p>
        </section>

        <section className="sigma-connect-card">
          <h2>2. Point your agent client at it</h2>
          <p>
            Example MCP client config (replace absolute paths):
          </p>
          <pre className="sigma-connect-code">{`{
  "mcpServers": {
    "sigmadesign": {
      "command": "pnpm",
      "args": ["--dir", "/ABSOLUTE/PATH/TO/sigmadesign", "mcp"],
      "env": {
        "SIGMADESIGN_HOME": "~/.sigmadesign"
      }
    }
  }
}`}</pre>
          <p className="sigma-connect-muted">
            Full samples ship inside the skill zip under{" "}
            <code>configs/</code>.
          </p>
        </section>

        <section className="sigma-connect-card">
          <h2>3. Teach the agent (skill)</h2>
          <p>
            The skill zip includes multi-step instructions: obtain design
            context → map components and tokens → implement UI → verify. Install
            it in your agent&apos;s skills folder, or attach{" "}
            <code>SKILL.md</code> to the session.
          </p>
          <ul className="sigma-connect-list">
            <li>
              <code>SKILL.md</code> — primary workflow
            </li>
            <li>
              <code>references/tool-catalog.md</code> — full tool list
            </li>
            <li>
              <code>configs/*.json</code> — client snippets
            </li>
          </ul>
          <a
            className="sigma-btn sigma-btn-primary"
            href="/skills/sigmadesign-implement.zip"
            download="sigmadesign-implement.zip"
          >
            Download skill zip
          </a>
        </section>

        <section className="sigma-connect-card">
          <h2>Available tools ({tools.length})</h2>
          <p className="sigma-connect-muted">
            Read tools cover library discovery, design context, styles,
            variables, comments, and screenshots. Write tools (create/update
            nodes, auto-layout) go beyond typical cloud design agent surfaces —
            all scoped to your local library only.
          </p>
          <div className="sigma-connect-tools">
            {tools.map((t) => (
              <div key={t.name} className="sigma-connect-tool">
                <code className="sigma-connect-tool-name">{t.name}</code>
                <span className="sigma-connect-tool-desc">{t.description}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="sigma-connect-card sigma-connect-card-soft">
          <h2>Privacy</h2>
          <p>
            The agent server only reads and writes data under your library home.
            No design-cloud OAuth or personal access tokens are required for this
            path.
          </p>
        </section>
      </main>
    </div>
  );
}
