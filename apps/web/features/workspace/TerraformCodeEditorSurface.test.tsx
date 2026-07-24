import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import type { RefObject, UIEvent } from "react";

import {
  TerraformCodeEditorSurface,
  type TerraformCodeEditorRefs
} from "./TerraformCodeEditorSurface";
import { createTerraformLineHighlightStyle } from "./terraform-editor-highlight-layout";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test("Terraform line highlights use the rendered editor font metrics", () => {
  const panelSource = readFileSync(new URL("./TerraformCodePanel.tsx", import.meta.url), "utf8");
  const surfaceStyles = readFileSync(
    new URL("./TerraformCodeEditorSurface.module.css", import.meta.url),
    "utf8"
  );

  assert.match(panelSource, /createTerraformLineHighlightStyle/);
  assert.match(
    surfaceStyles,
    /\.terraformSourceLineHighlight,\s*\.terraformBlockHighlightBox\s*{[^}]*font-size:\s*calc\(12px \+ var\(--presentation-font-size-increase\)\);/s
  );
});

test("Terraform line highlight layout stays aligned at deep scrolled line numbers", () => {
  assert.deepEqual(
    createTerraformLineHighlightStyle({
      endLine: 346,
      scrollTop: 9_700,
      startLine: 343
    }),
    {
      height: "6.4em",
      top: "calc(-9688px + 547.2em)"
    }
  );
});

test("Terraform editor scroll synchronizes gutter and highlighted code before React state catches up", () => {
  const lineNumbers = { current: { scrollTop: 0 } } as RefObject<HTMLOListElement | null>;
  const syntaxHighlight = {
    current: { style: { transform: "" } }
  } as unknown as RefObject<HTMLPreElement | null>;
  const textarea = { current: null } as RefObject<HTMLTextAreaElement | null>;
  const refs = { lineNumbers, syntaxHighlight, textarea } as unknown as TerraformCodeEditorRefs;
  let delegated = false;
  const surface = TerraformCodeEditorSurface({
    actions: {
      changeCode: () => undefined,
      handleKeyDown: () => undefined,
      handleScroll: () => {
        delegated = true;
      }
    },
    refs,
    state: {
      code: 'resource "aws_s3_bucket" "demo" {}',
      diagnosticLineNumbers: new Set(),
      highlightedBlockAddress: null,
      highlightedBlockStyle: null,
      highlightedLines: [],
      lineNumbers: [1],
      sourceLineHighlightStyle: null,
      syntaxHighlightStyle: {}
    }
  });
  const textareaElement = surface.props.children[2];

  textareaElement.props.onScroll({
    currentTarget: { scrollLeft: 37, scrollTop: 84 }
  } as UIEvent<HTMLTextAreaElement>);

  assert.equal(lineNumbers.current?.scrollTop, 84);
  assert.equal(syntaxHighlight.current?.style.transform, "translate3d(-37px, -84px, 0)");
  assert.equal(delegated, true);
});
