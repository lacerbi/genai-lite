/**
 * Template rendering engine for dynamic text generation
 * 
 * This module provides the core template rendering functionality that other
 * prompt-related modules depend on. It's a foundational utility for text
 * templating with variable substitution and conditional logic.
 */

/**
 * Renders a template string by substituting variables and evaluating conditional expressions.
 * 
 * Supports:
 * - Simple variable substitution: {{ variableName }}
 * - Conditional rendering: {{ condition ? `true result` : `false result` }}
 * - Conditional with only true branch: {{ condition ? `true result` }}
 * - Logical operators in conditions:
 *   - NOT: {{ !isDisabled ? `enabled` : `disabled` }}
 *   - AND: {{ hasPermission && isActive ? `show` : `hide` }}
 *   - OR: {{ isAdmin || isOwner ? `allow` : `deny` }}
 *   - Combined: {{ !isDraft && isPublished ? `public` : `private` }}
 * - Multi-line strings in backticks
 * - Intelligent newline handling (removes empty lines when result is empty)
 * 
 * Note: Logical operators support up to 2 operands. Complex expressions 
 * (parentheses, mixing && and ||, or 3+ operands) are not supported.
 * 
 * @param template The template string containing placeholders
 * @param variables Object containing variable values
 * @returns The rendered template string
 */
export function renderTemplate(
  template: string,
  variables: Record<string, any>
): string {
  // We need to handle nested {{ }} properly, so we'll use a custom approach
  let result = '';
  let lastIndex = 0;
  
  while (lastIndex < template.length) {
    // Find the next {{
    const startIndex = template.indexOf('{{', lastIndex);
    if (startIndex === -1) {
      // No more placeholders
      result += template.substring(lastIndex);
      break;
    }
    
    // Add everything before the placeholder
    result += template.substring(lastIndex, startIndex);
    
    // Check for leading newline
    const leadingNewline = startIndex > 0 && template[startIndex - 1] === '\n' ? '\n' : '';
    
    // Find the matching }}
    let depth = 1;
    let i = startIndex + 2;
    let inBacktick = false;
    let expression = '';
    
    while (i < template.length && depth > 0) {
      if (template[i] === '`' && (i === startIndex + 2 || template[i - 1] !== '\\')) {
        inBacktick = !inBacktick;
      } else if (!inBacktick) {
        if (template[i] === '{' && i + 1 < template.length && template[i + 1] === '{') {
          depth++;
          i++; // Skip the second {
        } else if (template[i] === '}' && i + 1 < template.length && template[i + 1] === '}') {
          depth--;
          if (depth === 0) {
            expression = template.substring(startIndex + 2, i);
            i++; // Skip the second }
            break;
          }
          i++; // Skip the second }
        }
      }
      i++;
    }
    
    if (depth > 0) {
      // Unmatched {{, treat as literal
      result += template.substring(startIndex, i);
      lastIndex = i;
      continue;
    }
    
    // Check for trailing newline
    const nextCharIndex = i + 1;
    const trailingNewline = nextCharIndex < template.length && template[nextCharIndex] === '\n' ? '\n' : '';
    
    // Process the expression
    const processedResult = processExpression(expression.trim(), variables, leadingNewline, trailingNewline);
    
    // Add the processed result (which already includes newlines when appropriate)
    result += processedResult;
    
    // Update lastIndex, skipping the trailing newline if the result was empty
    if (processedResult === '' && trailingNewline) {
      lastIndex = nextCharIndex + 1;
    } else {
      lastIndex = nextCharIndex;
    }
  }
  
  return result;
}

/**
 * Evaluates a condition string that may contain logical operators (&&, ||, !)
 * Supports:
 * - Simple variable: varName
 * - Negation: !varName
 * - AND: varName1 && varName2, !varName1 && varName2
 * - OR: varName1 || varName2, !varName1 || varName2
 * 
 * Does NOT support:
 * - Parentheses for grouping
 * - Mixing && and || in same expression
 * - More than 2 operands
 */
function evaluateCondition(condition: string, variables: Record<string, any>): boolean {
  condition = condition.trim();
  
  // Check for AND operator
  if (condition.includes('&&')) {
    const parts = condition.split('&&').map(p => p.trim());
    if (parts.length !== 2) {
      // Fallback to simple variable lookup for complex expressions
      return !!variables[condition];
    }
    return evaluateSimpleCondition(parts[0], variables) && evaluateSimpleCondition(parts[1], variables);
  }
  
  // Check for OR operator
  if (condition.includes('||')) {
    const parts = condition.split('||').map(p => p.trim());
    if (parts.length !== 2) {
      // Fallback to simple variable lookup for complex expressions
      return !!variables[condition];
    }
    return evaluateSimpleCondition(parts[0], variables) || evaluateSimpleCondition(parts[1], variables);
  }
  
  // Simple condition (possibly with negation)
  return evaluateSimpleCondition(condition, variables);
}

/**
 * Evaluates a simple condition that may have a ! prefix
 */
function evaluateSimpleCondition(condition: string, variables: Record<string, any>): boolean {
  condition = condition.trim();
  
  if (condition.startsWith('!')) {
    const varName = condition.substring(1).trim();
    return !variables[varName];
  }
  
  return !!variables[condition];
}

function processExpression(expression: string, variables: Record<string, any>, leadingNewline: string, trailingNewline: string): string {
    const conditionalMarkerIndex = expression.indexOf('?');

    let result: string;

    if (conditionalMarkerIndex === -1) {
      // --- Simple variable substitution (backward compatible) ---
      const key = expression as keyof typeof variables;
      const value = variables[key];
      // Handle task context specially - only include if it exists
      if (key === 'task_context' && (!value || (typeof value === 'string' && value.trim() === ''))) {
        result = '';
      } else {
        result = value !== undefined ? String(value) : '';
      }
    } else {
      // --- Conditional 'ternary' substitution ---
      const conditionStr = expression.substring(0, conditionalMarkerIndex).trim();
      const rest = expression.substring(conditionalMarkerIndex + 1).trim();

      // Parse ternary expression with backtick-delimited strings
      // We need to handle nested {{ }} within backticks
      let trueText: string;
      let falseText: string = ''; // Default to empty string if no 'else' part
      
      // Try to match backtick format with better handling of nested content
      if (rest.startsWith('`')) {
        // Find the matching closing backtick, accounting for escaped backticks
        let i = 1;
        let depth = 1;
        while (i < rest.length && depth > 0) {
          if (rest[i] === '\\' && i + 1 < rest.length && rest[i + 1] === '`') {
            i += 2; // Skip escaped backtick
          } else if (rest[i] === '`') {
            depth--;
            i++;
          } else {
            i++;
          }
        }
        
        if (depth === 0) {
          // Found matching backtick
          trueText = rest.substring(1, i - 1);
          const afterTrue = rest.substring(i).trim();
          
          // Check for false part
          if (afterTrue.startsWith(':')) {
            const falsePart = afterTrue.substring(1).trim();
            if (falsePart.startsWith('`')) {
              // Find matching backtick for false part
              let j = 1;
              let falseDepth = 1;
              while (j < falsePart.length && falseDepth > 0) {
                if (falsePart[j] === '\\' && j + 1 < falsePart.length && falsePart[j + 1] === '`') {
                  j += 2;
                } else if (falsePart[j] === '`') {
                  falseDepth--;
                  j++;
                } else {
                  j++;
                }
              }
              
              if (falseDepth === 0) {
                falseText = falsePart.substring(1, j - 1);
              }
            }
          }
          
          // Unescape any escaped backticks
          trueText = trueText.replace(/\\`/g, '`');
          falseText = falseText.replace(/\\`/g, '`');
        } else {
          // No matching backtick found
          trueText = rest;
        }
      } else {
        // Fallback to quote-based parsing for backward compatibility
        // Need to find the ':' that separates true/false parts, not one inside quotes
        let elseMarkerIndex = -1;
        let inSingleQuote = false;
        let inDoubleQuote = false;
        
        for (let i = 0; i < rest.length; i++) {
          const char = rest[i];
          const prevChar = i > 0 ? rest[i - 1] : '';
          
          // Track quote state (ignoring escaped quotes)
          if (char === "'" && prevChar !== '\\') {
            if (!inDoubleQuote) {
              inSingleQuote = !inSingleQuote;
            }
          } else if (char === '"' && prevChar !== '\\') {
            if (!inSingleQuote) {
              inDoubleQuote = !inDoubleQuote;
            }
          } else if (char === ':' && !inSingleQuote && !inDoubleQuote) {
            // Found the separator outside of quotes
            elseMarkerIndex = i;
            break;
          }
        }
        
        if (elseMarkerIndex === -1) {
          trueText = rest;
        } else {
          trueText = rest.substring(0, elseMarkerIndex).trim();
          falseText = rest.substring(elseMarkerIndex + 1).trim();
        }

        // Remove quotes from the start and end of the text parts
        const unquote = (text: string) => {
            if (text.startsWith('"') && text.endsWith('"')) {
                // Remove the outer double quotes and unescape inner quotes
                return text.slice(1, -1).replace(/\\"/g, '"');
            } else if (text.startsWith("'") && text.endsWith("'")) {
                // Remove the outer single quotes and unescape inner quotes
                return text.slice(1, -1).replace(/\\'/g, "'");
            }
            return text;
        };

        trueText = unquote(trueText);
        falseText = unquote(falseText);
      }

      const conditionValue = evaluateCondition(conditionStr, variables);
      result = conditionValue ? trueText : falseText;
      
      // Recursively process the result to handle nested variables
      if (result.includes('{{')) {
        result = renderTemplate(result, variables);
      }
    }

    // If result is empty, return empty string without newlines
    if (result === '') {
      return '';
    }

    // If result is not empty, return just the result without the captured newlines
    // The newlines are already part of the template structure
    return result;
}