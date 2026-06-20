"use client";

import React from "react";

interface MarkdownProps {
  content: string;
}

export default function Markdown({ content }: MarkdownProps) {
  if (!content) return null;

  // Split content by code blocks to separate code from text
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "12px", lineHeight: "1.5" }}>
      {parts.map((part, index) => {
        if (part.startsWith("```")) {
          // It's a code block
          const lines = part.split("\n");
          // Remove the first line (e.g. ```json or ```) and the last line (```)
          const firstLine = lines[0];
          const lang = firstLine.slice(3).trim();
          const codeContent = lines.slice(1, -1).join("\n");

          return (
            <pre 
              key={index} 
              style={{
                backgroundColor: "var(--bg-primary)",
                border: "1px solid var(--border-color)",
                borderRadius: "4px",
                padding: "8px 12px",
                overflowX: "auto",
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                color: "var(--text-primary)",
                margin: "4px 0"
              }}
            >
              {lang && (
                <div style={{ fontSize: "9px", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "4px", borderBottom: "1px solid var(--border-color)", paddingBottom: "2px" }}>
                  {lang}
                </div>
              )}
              <code>{codeContent}</code>
            </pre>
          );
        } else {
          // Regular text content with inline markdown and line breaks
          const lines = part.split("\n");
          return (
            <div key={index} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {lines.map((line, lIdx) => {
                const trimmed = line.trim();
                if (!trimmed) return <div key={lIdx} style={{ height: "4px" }}></div>;

                // Headers
                if (trimmed.startsWith("# ")) {
                  return <h1 key={lIdx} style={{ fontSize: "16px", fontWeight: "700", marginTop: "8px", marginBottom: "4px", borderBottom: "1px solid var(--border-color)", paddingBottom: "2px" }}>{parseInline(trimmed.slice(2))}</h1>;
                }
                if (trimmed.startsWith("## ")) {
                  return <h2 key={lIdx} style={{ fontSize: "14px", fontWeight: "700", marginTop: "6px", marginBottom: "3px" }}>{parseInline(trimmed.slice(3))}</h2>;
                }
                if (trimmed.startsWith("### ")) {
                  return <h3 key={lIdx} style={{ fontSize: "12px", fontWeight: "700", marginTop: "4px", marginBottom: "2px" }}>{parseInline(trimmed.slice(4))}</h3>;
                }

                // Unordered list item
                if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
                  return (
                    <ul key={lIdx} style={{ paddingLeft: "16px", margin: "2px 0" }}>
                      <li style={{ listStyleType: "disc" }}>{parseInline(trimmed.slice(2))}</li>
                    </ul>
                  );
                }

                // Regular paragraph line
                return <p key={lIdx} style={{ margin: 0 }}>{parseInline(line)}</p>;
              })}
            </div>
          );
        }
      })}
    </div>
  );
}

// Helper to parse inline markdown (bold **bold**, code `code`)
function parseInline(text: string): React.ReactNode[] {
  // Regex to split bold ** and code `
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index} style={{ fontWeight: "700" }}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code 
          key={index} 
          style={{
            fontFamily: "var(--font-mono)",
            backgroundColor: "var(--bg-primary)",
            padding: "1px 4px",
            borderRadius: "3px",
            border: "1px solid var(--border-color)",
            fontSize: "11px",
            color: "var(--danger)"
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}
