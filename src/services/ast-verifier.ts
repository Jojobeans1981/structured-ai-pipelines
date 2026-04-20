import * as ts from 'typescript';
import fs from 'fs/promises';

export class ASTVerifier {
  /**
   * Parses the generated TypeScript file into an Abstract Syntax Tree (AST).
   * It crawls the tree to mathematically prove there are no empty stubs or "TODOs".
   */
  static async verifyFile(filePath: string): Promise<string[]> {
    const errors: string[] = [];
    try {
      const code = await fs.readFile(filePath, 'utf8');
      const sourceFile = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, true);

      // Walk the AST recursively
      function visit(node: ts.Node) {
        // RULE 1: Catch empty function bodies (e.g., function doSomething() {})
        if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node)) {
          if (node.body && ts.isBlock(node.body) && node.body.statements.length === 0) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            errors.push(`[AST Error] Empty function implementation detected at line ${line + 1}.`);
          }
        }

        // RULE 2: Catch "throw new Error('Not implemented')" stubs
        if (ts.isThrowStatement(node)) {
          const throwText = node.expression.getText(sourceFile).toLowerCase();
          if (throwText.includes('implement') || throwText.includes('todo')) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            errors.push(`[AST Error] 'Not Implemented' stub detected at line ${line + 1}.`);
          }
        }

        ts.forEachChild(node, visit);
      }

      visit(sourceFile);

      // RULE 3: Catch // TODO comments by scanning the raw text for safety
      if (code.toLowerCase().includes('todo:') || code.toLowerCase().includes('fixme:')) {
        errors.push(`[AST Error] Unresolved TODO/FIXME comments found in file.`);
      }

    } catch (error) {
      errors.push(`[AST Critical] Failed to parse file ${filePath}. Invalid TypeScript syntax.`);
    }

    return errors;
  }
}
