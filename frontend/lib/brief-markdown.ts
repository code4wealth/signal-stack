import type { Brief, BriefActionItem } from "./types";

function fmtCite(citations: number[]): string {
  if (!citations.length) return "[Missing evidence]";
  return citations.map((n) => `[${n}]`).join("");
}

const SECTION_LABELS: Record<string, string> = {
  customers: "Customer Signals",
  competitors: "Competitor Intelligence",
  market: "Market Intelligence",
  internal: "Internal Intelligence",
};

export function briefToMarkdown(brief: Brief): string {
  const lines: string[] = [
    `# Monday Morning Brief — ${brief.companyName}`,
    `_Week of ${brief.weekStart} to ${brief.weekEnd} · v${brief.version} (${brief.status})_`,
    "",
    `- Signals analysed: ${brief.stats.signals}`,
    `- Sources monitored: ${brief.stats.sources}`,
    `- New evidence items: ${brief.stats.newEvidence}`,
    `- Verified evidence: ${brief.stats.verifiedPct}%`,
    "",
    "## 01. Executive Summary",
  ];

  if (brief.executiveSummary.length === 0) {
    lines.push("No top signals recorded for this period.", "");
  } else {
    brief.executiveSummary.forEach((item, idx) => {
      lines.push(
        `### ${String(idx + 1).padStart(2, "0")}. ${item.headline} (${item.classification}, priority ${item.priority}/5)`,
        `Fact: ${item.fact.text} ${fmtCite(item.fact.citations)}`,
        `Why it matters: ${item.whyItMatters.text} ${fmtCite(item.whyItMatters.citations)}`,
      );
      if (item.action?.text) {
        lines.push(`Recommended move: ${item.action.text}`);
      }
      lines.push("");
    });
  }

  brief.sections.forEach((sec, idx) => {
    const num = String(idx + 2).padStart(2, "0");
    lines.push(`## ${num}. ${SECTION_LABELS[sec.key] ?? sec.key}`);
    if (sec.summary) {
      lines.push(`${sec.summary.text} ${fmtCite(sec.summary.citations)}`, "");
    }
    if (sec.items.length === 0) {
      lines.push(
        `No high-priority signals in this category (${sec.sourcesChecked} sources checked).`,
        "",
      );
    } else {
      sec.items.forEach((item) => {
        lines.push(
          `- **${item.headline}** (${item.classification}, P${item.priority}): ${item.fact.text} ${fmtCite(item.fact.citations)} — _${item.whyItMatters.text}_`,
        );
      });
      lines.push("");
    }
    const note = brief.notes.find((n) => n.sectionKey === sec.key);
    if (note?.text.trim()) {
      lines.push(`> Your note: ${note.text.trim()}`, "");
    }
  });

  lines.push("## 06. Opportunities");
  if (brief.opportunities.length === 0) {
    lines.push("No verified opportunities identified this period.", "");
  } else {
    brief.opportunities.forEach((opp) => {
      lines.push(
        `- **${opp.headline}** (${opp.impactLevel} impact): ${opp.explanation.text} ${fmtCite(opp.explanation.citations)}`,
      );
    });
    lines.push("");
  }

  lines.push("## 07. Risks & Threats");
  if (brief.risks.length === 0) {
    lines.push("No verified risks identified this period.", "");
  } else {
    brief.risks.forEach((r) => {
      lines.push(
        `- **${r.headline}** (${r.likelihood} likelihood, ${r.impactLevel} impact): ${r.explanation.text} ${fmtCite(r.explanation.citations)}`,
      );
    });
    lines.push("");
  }

  lines.push("## 08. Recommended Actions");
  if (brief.actions.length === 0) {
    lines.push("No actions recorded.", "");
  } else {
    brief.actions.forEach((a) => {
      const box = a.done ? "x" : " ";
      const due = a.dueDate ? ` · due ${a.dueDate}` : "";
      lines.push(
        `- [${box}] **${a.text}** — ${a.owner} (${a.effort} effort${due}) ${fmtCite(a.citations)}`,
      );
    });
    lines.push("");
  }

  lines.push("## 09. What We Should Watch");
  if (brief.watch.length === 0) {
    lines.push("No watchlist triggers flagged for next week.", "");
  } else {
    brief.watch.forEach((w) => {
      lines.push(`- **${w.title}**: ${w.why.text} ${fmtCite(w.why.citations)}`);
    });
    lines.push("");
  }

  lines.push("## 10. Source Appendix");
  brief.sources.forEach((src) => {
    lines.push(
      `[${src.n}] ${src.title} — ${src.url} (${src.type}, fetched ${src.fetchedAt})`,
    );
  });
  lines.push("");

  return lines.join("\n");
}

export function actionsChecklistText(actions: BriefActionItem[]): string {
  return actions
    .map((a) => {
      const box = a.done ? "[x]" : "[ ]";
      const due = a.dueDate ? ` (due ${a.dueDate})` : "";
      return `${box} ${a.text} — ${a.owner}${due}`;
    })
    .join("\n");
}

function csvCell(val: string): string {
  const safe = val.replace(/"/g, '""');
  return `"${safe}"`;
}

export function actionsToCsv(actions: BriefActionItem[]): string {
  const header = ["Done", "Action", "Owner", "Due Date", "Effort", "Citations"].join(",");
  const rows = actions.map((a) =>
    [
      a.done ? "Yes" : "No",
      csvCell(a.text),
      csvCell(a.owner),
      csvCell(a.dueDate ?? ""),
      csvCell(a.effort),
      csvCell(a.citations.map((c) => `[${c}]`).join(" ")),
    ].join(","),
  );
  return [header, ...rows].join("\n");
}
