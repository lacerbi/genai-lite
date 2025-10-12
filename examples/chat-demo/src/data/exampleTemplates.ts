/**
 * Example Templates Collection for genai-lite Chat Demo
 *
 * These templates demonstrate various features of genai-lite:
 * - Variable substitution
 * - Conditional logic
 * - Model-aware prompting
 * - Self-contained templates with <META> blocks
 * - Reasoning and thinking modes
 */

export interface ExampleTemplate {
  id: string;
  name: string;
  description: string;
  template: string;
  defaultVariables: Record<string, string | boolean | number>;
  category: 'general' | 'code' | 'creative' | 'analysis';
  tags: string[];
}

export const exampleTemplates: ExampleTemplate[] = [
  {
    id: 'basic-greeting',
    name: 'Basic Greeting Assistant',
    description: 'Simple greeting template with variable substitution',
    template: `<SYSTEM>You are a friendly assistant.</SYSTEM>
<USER>Hello! My name is {{ name }} and I'm interested in {{ topic }}.</USER>`,
    defaultVariables: {
      name: 'Alex',
      topic: 'learning TypeScript'
    },
    category: 'general',
    tags: ['basic', 'greeting']
  },

  {
    id: 'code-review',
    name: 'Code Review with Thinking',
    description: 'Demonstrates thinking extraction for code review',
    template: `<META>
{
  "settings": {
    "temperature": 0.3,
    "maxTokens": 2000,
    "thinkingExtraction": { "enabled": true }
  }
}
</META>
<SYSTEM>You are an expert code reviewer. When reviewing code, first write your analysis inside <thinking> tags, then provide actionable feedback.</SYSTEM>
<USER>Review this {{ language }} code:

\`\`\`{{ language }}
{{ code }}
\`\`\`

Focus on: {{ focus_areas }}</USER>`,
    defaultVariables: {
      language: 'typescript',
      code: 'function add(a, b) {\n  return a + b;\n}',
      focus_areas: 'type safety, error handling, and best practices'
    },
    category: 'code',
    tags: ['code-review', 'thinking', 'meta-settings']
  },

  {
    id: 'creative-writing',
    name: 'Creative Writing Assistant',
    description: 'High-temperature settings for creative tasks',
    template: `<META>
{
  "settings": {
    "temperature": 0.9,
    "maxTokens": 3000,
    "topP": 0.95
  }
}
</META>
<SYSTEM>You are a creative writing assistant. Help users craft engaging stories with vivid details and compelling narratives.</SYSTEM>
<USER>Write a {{ length }} story about {{ topic }}.{{ hasStyle ? ' Use a ' + style + ' style.' : '' }}</USER>`,
    defaultVariables: {
      length: 'short',
      topic: 'a robot discovering music for the first time',
      hasStyle: true,
      style: 'whimsical'
    },
    category: 'creative',
    tags: ['creative', 'writing', 'meta-settings']
  },

  {
    id: 'problem-solving',
    name: 'Problem Solver with Reasoning',
    description: 'Model-aware template that adapts to reasoning capabilities',
    template: `<SYSTEM>You are a {{ thinking_enabled ? 'thoughtful problem solver who thinks step-by-step' : 'helpful problem-solving assistant' }}.
{{ thinking_available && !thinking_enabled ? 'Note: You have advanced reasoning capabilities available for complex problems.' : '' }}</SYSTEM>
<USER>{{ thinking_enabled ? 'Please solve this step-by-step:' : 'Please solve this problem:' }}

{{ problem }}

{{ hasConstraints ? 'Constraints: ' + constraints : '' }}</USER>`,
    defaultVariables: {
      problem: 'If a train travels 120 km in 2 hours, what is its average speed in meters per second?',
      hasConstraints: true,
      constraints: 'Show all conversion steps'
    },
    category: 'analysis',
    tags: ['problem-solving', 'model-aware', 'reasoning']
  },

  {
    id: 'translation-fewshot',
    name: 'Translation with Few-Shot Examples',
    description: 'Demonstrates few-shot learning pattern',
    template: `<SYSTEM>You are a professional translator. Provide accurate, natural-sounding translations.</SYSTEM>
<USER>Examples of good translations:

English: "Hello, how are you?"
{{ target_language }}: {{ example1 }}

English: "Thank you very much"
{{ target_language }}: {{ example2 }}

Now translate:
English: "{{ text_to_translate }}"
{{ target_language }}: </USER>`,
    defaultVariables: {
      target_language: 'Spanish',
      example1: '¡Hola! ¿Cómo estás?',
      example2: 'Muchas gracias',
      text_to_translate: 'I would like to order a coffee, please.'
    },
    category: 'general',
    tags: ['translation', 'few-shot']
  },

  {
    id: 'technical-docs',
    name: 'Technical Documentation Writer',
    description: 'Structured documentation generation',
    template: `<META>
{
  "settings": {
    "temperature": 0.4,
    "maxTokens": 2500
  }
}
</META>
<SYSTEM>You are a technical documentation specialist. Create clear, comprehensive documentation with examples.</SYSTEM>
<USER>Write {{ doc_type }} documentation for: {{ subject }}

{{ hasAudience ? 'Target audience: ' + audience : '' }}
{{ hasFormat ? 'Required format: ' + format : '' }}

{{ includeExamples ? 'Include practical code examples.' : '' }}</USER>`,
    defaultVariables: {
      doc_type: 'API',
      subject: 'a REST endpoint that creates user accounts',
      hasAudience: true,
      audience: 'frontend developers',
      hasFormat: true,
      format: 'Markdown with code blocks',
      includeExamples: true
    },
    category: 'code',
    tags: ['documentation', 'technical', 'meta-settings']
  },

  {
    id: 'data-analysis',
    name: 'Data Analysis Assistant',
    description: 'Analytical thinking with conditional detail level',
    template: `<SYSTEM>You are a data analysis expert. {{ detail_level === 'detailed' ? 'Provide comprehensive analysis with statistical insights.' : 'Provide concise, actionable insights.' }}</SYSTEM>
<USER>Analyze this {{ data_type }} data:

{{ data }}

{{ hasQuestions ? 'Answer these questions:\n' + questions : 'Provide key insights and patterns.' }}</USER>`,
    defaultVariables: {
      data_type: 'sales',
      detail_level: 'detailed',
      data: 'Q1: $45k, Q2: $52k, Q3: $48k, Q4: $61k',
      hasQuestions: true,
      questions: '1. What is the growth trend?\n2. Which quarter performed best?'
    },
    category: 'analysis',
    tags: ['data-analysis', 'conditional']
  },

  {
    id: 'debugging-helper',
    name: 'Debugging Assistant',
    description: 'Context-aware debugging with optional stack trace',
    template: `<SYSTEM>You are a debugging expert specializing in {{ language }}. {{ includeStackTrace ? 'Analyze the stack trace carefully to identify the root cause.' : 'Focus on the error message and code context.' }}</SYSTEM>
<USER>I'm getting this error:
{{ error_message }}

{{ includeStackTrace ? 'Stack trace:\n' + stack_trace + '\n\n' : '' }}Code context:
\`\`\`{{ language }}
{{ code }}
\`\`\`

{{ hasAttempts ? 'What I\'ve tried:\n' + attempts : '' }}

Help me fix this issue.</USER>`,
    defaultVariables: {
      language: 'JavaScript',
      error_message: 'TypeError: Cannot read property \'length\' of undefined',
      includeStackTrace: false,
      stack_trace: '',
      code: 'function getItems(arr) {\n  return arr.filter(item => item.length > 0);\n}',
      hasAttempts: true,
      attempts: '- Checked if arr is defined\n- Added console.log statements'
    },
    category: 'code',
    tags: ['debugging', 'error-handling', 'conditional']
  },

  {
    id: 'interview-prep',
    name: 'Interview Question Analyzer',
    description: 'Structured interview preparation with thinking',
    template: `<META>
{
  "settings": {
    "temperature": 0.5,
    "maxTokens": 2000,
    "thinkingExtraction": { "enabled": true }
  }
}
</META>
<SYSTEM>You are an interview preparation coach. When analyzing questions, first think through the best approach in <thinking> tags, then provide a structured answer.</SYSTEM>
<USER>Interview question for {{ position }} role:

"{{ question }}"

{{ hasContext ? 'Context: ' + context : '' }}

Help me prepare a strong answer{{ includeTips ? ' and provide tips for delivery' : '' }}.</USER>`,
    defaultVariables: {
      position: 'Senior Frontend Developer',
      question: 'Describe a time when you had to optimize the performance of a web application.',
      hasContext: true,
      context: 'The role involves working on large-scale React applications',
      includeTips: true
    },
    category: 'general',
    tags: ['interview', 'thinking', 'meta-settings']
  },

  {
    id: 'learning-tutor',
    name: 'Adaptive Learning Tutor',
    description: 'Adjusts explanation style based on experience level',
    template: `<SYSTEM>You are a patient tutor{{ experience === 'beginner' ? ' who explains concepts in simple terms with analogies' : experience === 'intermediate' ? ' who provides balanced explanations with practical examples' : ' who dives deep into technical details and edge cases' }}.</SYSTEM>
<USER>Explain {{ concept }} to someone with {{ experience }} experience in {{ field }}.

{{ hasExample ? 'Use this example: ' + example : '' }}
{{ hasComparison ? 'Compare it to: ' + comparison : '' }}</USER>`,
    defaultVariables: {
      concept: 'closures in JavaScript',
      experience: 'beginner',
      field: 'programming',
      hasExample: true,
      example: 'a counter function that remembers its count',
      hasComparison: false,
      comparison: ''
    },
    category: 'general',
    tags: ['education', 'adaptive', 'conditional']
  }
];

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: ExampleTemplate['category']): ExampleTemplate[] {
  return exampleTemplates.filter(t => t.category === category);
}

/**
 * Get template by ID
 */
export function getTemplateById(id: string): ExampleTemplate | undefined {
  return exampleTemplates.find(t => t.id === id);
}

/**
 * Get all categories
 */
export function getCategories(): ExampleTemplate['category'][] {
  return ['general', 'code', 'creative', 'analysis'];
}
