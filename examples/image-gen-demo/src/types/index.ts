// API Response Types

export interface HealthStatus {
  status: 'ok' | 'error';
  busy: boolean;
  error?: string;
}

export interface Provider {
  id: string;
  displayName: string;
  description: string;
  available: boolean;
  capabilities?: {
    supportsMultipleImages?: boolean;
    supportsProgressEvents?: boolean;
    supportsNegativePrompt?: boolean;
    defaultModelId?: string;
  };
}

export interface Model {
  id: string;
  providerId: string;
  displayName: string;
  description: string;
  defaultSettings?: {
    width?: number;
    height?: number;
    quality?: string;
  };
}

export interface Preset {
  id: string;
  displayName: string;
  description: string;
  providerId: string;
  modelId: string;
  settings: ImageSettings;
}

export interface GeneratedImage {
  index: number;
  data: string; // base64
  seed?: number;
  width: number;
  height: number;
  generatedAt: number;
  generationTime: number; // Duration in milliseconds
}

// Settings Types

export interface ImageSettings {
  width?: number;
  height?: number;
  quality?: 'auto' | 'high' | 'medium' | 'low' | 'hd' | 'standard';
  style?: 'vivid' | 'natural';
  openai?: {
    outputFormat?: 'png' | 'jpeg' | 'webp';
    background?: 'auto' | 'transparent' | 'white' | 'black';
  };
  diffusion?: {
    negativePrompt?: string;
    steps?: number;
    cfgScale?: number;
    sampler?: string;
    seed?: number;
  };
}

// API Request/Response Types

export interface GenerateRequest {
  providerId: string;
  modelId: string;
  prompt: string;
  count?: number;
  settings?: ImageSettings;
}

export interface GenerateResponse {
  success: boolean;
  result?: {
    images: Array<{
      index: number;
      data: string; // base64
      seed?: number;
      width: number;
      height: number;
    }>;
    created: number;
    providerId: string;
    modelId: string;
  };
  error?: {
    message: string;
    code: string;
    type?: string;
  };
}

// Component Props Types

export interface ProviderSelectorProps {
  selectedProviderId: string;
  selectedModelId: string;
  onProviderChange: (providerId: string) => void;
  onModelChange: (modelId: string) => void;
}

export interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  disabled?: boolean;
}

export interface SettingsPanelProps {
  providerId: string;
  settings: ImageSettings;
  count: number;
  onSettingsChange: (settings: ImageSettings) => void;
  onCountChange: (count: number) => void;
  // Preset support
  presets: Preset[];
  activePresetId: string | null;
  onApplyPreset: (preset: Preset) => void;
}

export interface ImageGalleryProps {
  images: GeneratedImage[];
  onDownload: (index: number) => void;
  onDelete: (index: number) => void;
  onClearAll: () => void;
}

export interface ImageCardProps {
  image: GeneratedImage;
  onDownload: () => void;
  onDelete: () => void;
  onImageClick?: () => void;
}

export interface ProgressDisplayProps {
  isGenerating: boolean;
  stage?: 'loading' | 'diffusion' | 'decoding';
  percentage?: number;
  currentStep?: number;
  totalSteps?: number;
  elapsed?: number;
}

export interface ErrorDisplayProps {
  error: {
    message: string;
    code?: string;
    type?: string;
  } | null;
  onDismiss: () => void;
}
