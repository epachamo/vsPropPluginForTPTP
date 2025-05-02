import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  const diagnosticCollection = vscode.languages.createDiagnosticCollection('tptpproplog');
  context.subscriptions.push(diagnosticCollection);

  if (vscode.window.activeTextEditor) {
    updateDiagnostics(vscode.window.activeTextEditor.document, diagnosticCollection);
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(e => updateDiagnostics(e.document, diagnosticCollection)),
    vscode.workspace.onDidOpenTextDocument(doc => updateDiagnostics(doc, diagnosticCollection))
  );
}

function updateDiagnostics(document: vscode.TextDocument, collection: vscode.DiagnosticCollection) {
  if (document.languageId !== 'tptpproplog') return;

  const diagnostics: vscode.Diagnostic[] = [];
  const text = document.getText();
  const uncommented = text.replace(/%.*/g, m => ' '.repeat(m.length)); // preserve offsets

  const statementRegex = /fof\s*\(.*?\)\s*\./gs;
  const matches = Array.from(uncommented.matchAll(statementRegex));

  let lastIndex = 0;
  let conjectureCount = 0;
  const seenLabels = new Set<string>();

  for (const match of matches) {
    const fullStmt = match[0];
    const offset = match.index!;
    const stmtStart = fullStmt.trimStart();

    // Check start
    if (!/^\s*fof\s*\(/.test(stmtStart)) {
      const pos = document.positionAt(offset);
      diagnostics.push(new vscode.Diagnostic(
        new vscode.Range(pos, pos.translate(0, stmtStart.length)),
        'Each statement must begin with "fof(", optionally with whitespace between.',
        vscode.DiagnosticSeverity.Error
      ));
    }

    // Check end
    if (!fullStmt.trimEnd().endsWith('.')) {
      const endPos = document.positionAt(offset + fullStmt.length - 1);
      diagnostics.push(new vscode.Diagnostic(
        new vscode.Range(endPos, endPos.translate(0, 1)),
        'Each statement must end with a period ".".',
        vscode.DiagnosticSeverity.Error
      ));
    }

    const matchHeader = /fof\s*\(\s*([a-z][A-Za-z0-9_]*)\s*,\s*(axiom|conjecture)\s*,/.exec(fullStmt);
    if (!matchHeader) {
      const pos = document.positionAt(offset);
      diagnostics.push(new vscode.Diagnostic(
        new vscode.Range(pos, pos.translate(0, fullStmt.length)),
        'Invalid FOF statement: must follow fof(label_first_letter_lower_case, "axiom" or "conjecture", formula).',
        vscode.DiagnosticSeverity.Error
      ));
      continue;
    }

    const [_, label, kind] = matchHeader;
    const labelPos = document.positionAt(text.indexOf(label, offset));

    if (!/^[a-z][A-Za-z0-9_]*$/.test(label)) {
      diagnostics.push(new vscode.Diagnostic(
        new vscode.Range(labelPos, labelPos.translate(0, label.length)),
        'Label must start with a lowercase letter and contain only alphanumeric characters or underscores.',
        vscode.DiagnosticSeverity.Error
      ));
    }

    if (seenLabels.has(label)) {
      diagnostics.push(new vscode.Diagnostic(
        new vscode.Range(labelPos, labelPos.translate(0, label.length)),
        `Duplicate label "${label}" is not allowed.`,
        vscode.DiagnosticSeverity.Error
      ));
    } else {
      seenLabels.add(label);
    }

    if (kind === 'conjecture') {
      conjectureCount++;
      if (conjectureCount > 1) {
        diagnostics.push(new vscode.Diagnostic(
          new vscode.Range(labelPos, labelPos.translate(0, fullStmt.length)),
          'Only one conjecture statement is allowed.',
          vscode.DiagnosticSeverity.Error
        ));
      }
    }

    // Parenthesis balancing
    let balance = 0;
    for (let i = 0; i < fullStmt.length; i++) {
      if (fullStmt[i] === '(') balance++;
      if (fullStmt[i] === ')') balance--;
      if (balance < 0) {
        const pos = document.positionAt(offset + i);
        diagnostics.push(new vscode.Diagnostic(
          new vscode.Range(pos, pos.translate(0, 1)),
          'Unmatched closing parenthesis',
          vscode.DiagnosticSeverity.Error
        ));
        break;
      }
    }
    if (balance > 0) {
      const pos = document.positionAt(offset);
      diagnostics.push(new vscode.Diagnostic(
        new vscode.Range(pos, pos.translate(0, 1)),
        'Unmatched opening parenthesis',
        vscode.DiagnosticSeverity.Error
      ));
    }

    lastIndex = offset + fullStmt.length;
  }

  // Optional: check for any trailing unexpected content
  const trailing = uncommented.slice(lastIndex).trim();
  if (trailing.length > 0) {
    const startPos = document.positionAt(lastIndex);
    const endPos = document.positionAt(uncommented.length);
    diagnostics.push(new vscode.Diagnostic(
      new vscode.Range(startPos, endPos),
      'Unexpected text after last valid FOF statement.',
      vscode.DiagnosticSeverity.Error
    ));
  }

  collection.set(document.uri, diagnostics);
}


export function deactivate() {}
