/**
 * Examples of using the prompt engineering utilities from genai-lite
 */

import {
  chunkPrompt,
  optimizePrompt,
  validatePrompt,
  buildStructuredPrompt,
  ChunkConfig,
  OptimizationConfig,
  PromptSection,
  countTokens
} from '../src';

// Example 1: Chunking a long document for processing
function chunkDocumentExample() {
  console.log('=== Example 1: Chunking Long Documents ===\n');
  
  const longDocument = `
    This is a very long document that needs to be processed in chunks.
    It contains multiple paragraphs and sections that exceed the token limit.
    
    Section 1: Introduction
    This section provides an overview of the document and its purpose.
    It contains important context that should be preserved across chunks.
    
    Section 2: Main Content
    The main content is extensive and covers various topics in detail.
    Each topic requires careful analysis and processing.
    
    Section 3: Technical Details
    Technical specifications and implementation details are provided here.
    These details are crucial for understanding the complete picture.
    
    Section 4: Conclusion
    The conclusion summarizes the key points and provides recommendations.
    It references content from earlier sections.
  `.repeat(10); // Make it longer

  const config: ChunkConfig = {
    maxTokens: 100,
    model: 'gpt-4',
    overlap: 20, // Keep some context between chunks
    separator: '\n\n--- Next Chunk ---\n\n'
  };

  const chunks = chunkPrompt(longDocument, config);
  
  console.log(`Original document tokens: ${countTokens(longDocument, 'gpt-4')}`);
  console.log(`Split into ${chunks.length} chunks\n`);
  
  chunks.forEach((chunk, index) => {
    console.log(`Chunk ${index + 1} (${countTokens(chunk, 'gpt-4')} tokens):`);
    console.log(chunk.substring(0, 100) + '...\n');
  });
}

// Example 2: Optimizing prompts with sections
function optimizePromptExample() {
  console.log('\n=== Example 2: Optimizing Prompts ===\n');
  
  const sections: PromptSection[] = [
    {
      name: 'system',
      content: 'You are a helpful AI assistant specializing in code review.',
      priority: 1,
      required: true
    },
    {
      name: 'context',
      content: 'The user is working on a TypeScript project using React and Node.js. The project follows clean architecture principles and uses Jest for testing.',
      priority: 2
    },
    {
      name: 'code',
      content: `
        function processData(input: string[]): Record<string, number> {
          const result: Record<string, number> = {};
          for (let i = 0; i < input.length; i++) {
            const item = input[i];
            if (result[item]) {
              result[item]++;
            } else {
              result[item] = 1;
            }
          }
          return result;
        }
      `,
      priority: 3,
      required: true
    },
    {
      name: 'previous_feedback',
      content: 'In previous reviews, you suggested using more functional programming patterns and improving type safety.',
      priority: 5
    },
    {
      name: 'instructions',
      content: 'Please review the code for performance, readability, and best practices. Suggest improvements using modern TypeScript features.',
      priority: 4,
      required: true
    }
  ];

  const config: OptimizationConfig = {
    maxTokens: 200,
    model: 'gpt-4',
    compression: 'light',
    preservePriority: ['code'] // Don't compress the code section
  };

  const optimized = optimizePrompt(sections, config);
  
  console.log('Optimized prompt:');
  console.log(optimized);
  console.log(`\nTotal tokens: ${countTokens(optimized, 'gpt-4')}`);
}

// Example 3: Validating prompts
function validatePromptExample() {
  console.log('\n=== Example 3: Validating Prompts ===\n');
  
  const prompts = [
    {
      name: 'Good prompt',
      text: 'Please analyze the following code and identify potential security vulnerabilities:\n\n```javascript\nfunction authenticate(username, password) {\n  return db.query(`SELECT * FROM users WHERE username = "${username}" AND password = "${password}"`);\n}\n```'
    },
    {
      name: 'Too long prompt',
      text: 'Please analyze this code. '.repeat(100)
    },
    {
      name: 'Vague prompt',
      text: 'The code is here and it does things with data and stuff.'
    },
    {
      name: 'Repetitive prompt',
      text: 'Please check the code and ensure the code is correct. The code should follow best practices for code. Review the code for code quality and code performance.'
    }
  ];

  prompts.forEach(({ name, text }) => {
    console.log(`\nValidating: ${name}`);
    const result = validatePrompt(text, 100, 'gpt-4');
    
    console.log(`- Valid: ${result.isValid}`);
    console.log(`- Token count: ${result.tokenCount}`);
    
    if (result.issues.length > 0) {
      console.log('- Issues:');
      result.issues.forEach(issue => console.log(`  * ${issue}`));
    }
    
    if (result.suggestions && result.suggestions.length > 0) {
      console.log('- Suggestions:');
      result.suggestions.forEach(suggestion => console.log(`  * ${suggestion}`));
    }
  });
}

// Example 4: Building structured prompts
function buildStructuredPromptExample() {
  console.log('\n=== Example 4: Building Structured Prompts ===\n');
  
  const template = `
You are analyzing a {{ language }} project.
{{ hasTests ? \`The project includes unit tests.\` : \`The project lacks test coverage.\` }}

Project Type: {{ projectType }}
Framework: {{ framework }}

Please provide:
1. Code quality assessment
2. {{ hasTests ? \`Test coverage analysis\` : \`Testing recommendations\` }}
3. Performance optimization suggestions
4. Security considerations
`;

  const contexts = [
    {
      language: 'TypeScript',
      hasTests: true,
      projectType: 'Web Application',
      framework: 'React + Express'
    },
    {
      language: 'Python',
      hasTests: false,
      projectType: 'Data Pipeline',
      framework: 'Apache Airflow'
    }
  ];

  contexts.forEach((context, index) => {
    console.log(`\nPrompt ${index + 1}:`);
    
    const sections: PromptSection[] = [
      {
        name: 'Additional Context',
        content: `The project is in ${context.hasTests ? 'maintenance' : 'active development'} phase.`,
        priority: 2
      },
      {
        name: 'Focus Areas',
        content: 'Pay special attention to error handling and logging.',
        priority: 3
      }
    ];

    const prompt = buildStructuredPrompt(template, context, {
      sections,
      maxTokens: 500,
      model: 'gpt-4'
    });
    
    console.log(prompt);
    console.log(`\nTokens: ${countTokens(prompt, 'gpt-4')}`);
  });
}

// Run all examples
console.log('genai-lite Prompt Engineering Examples\n');
console.log('======================================\n');

chunkDocumentExample();
optimizePromptExample();
validatePromptExample();
buildStructuredPromptExample();

console.log('\n======================================');
console.log('\nExamples completed!');