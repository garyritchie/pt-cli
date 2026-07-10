import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { loadConfig, saveConfig } from '../config.js';

export interface AddOptions {
  file?: string;
}

/**
 * Validate JSON file exists and contains valid JSON
 */
function validateJsonFile(filePath: string): { valid: boolean; data?: any; error?: string } {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return {
        valid: false,
        error: `File not found: ${filePath}`
      };
    }
    
    // Check file size (reasonable limit to prevent reading huge files)
    const stats = fs.statSync(filePath);
    if (stats.size > 10 * 1024 * 1024) { // 10MB limit
      return {
        valid: false,
        error: `File too large (${stats.size} bytes). Maximum size is 10MB.`
      };
    }
    
    // Read and parse JSON
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.trim()) {
      return {
        valid: false,
        error: 'File is empty'
      };
    }
    
    const data = JSON.parse(content);
    return { valid: true, data };
  } catch (e) {
    const error = e as Error;
    return {
      valid: false,
      error: `JSON parse error: ${error.message}`
    };
  }
}

/**
 * Validate template structure
 */
function validateTemplateStructure(data: any): { valid: boolean; error?: string } {
  if (!data || typeof data !== 'object') {
    return {
      valid: false,
      error: 'Template data must be a JSON object'
    };
  }
  
  // Basic structure validation
  if (data.description && typeof data.description !== 'string') {
    return {
      valid: false,
      error: 'Template description must be a string'
    };
  }
  
  if (data.variables && Array.isArray(data.variables)) {
    for (let i = 0; i < data.variables.length; i++) {
      const v = data.variables[i];
      if (!v.name || typeof v.name !== 'string') {
        return {
          valid: false,
          error: `Variable at index ${i} must have a string 'name' field`
        };
      }
    }
  }
  
  return { valid: true };
}

export function addCommand(name: string, jsonStr: string | undefined, options: AddOptions = {}) {
  const config = loadConfig();
  
  // Determine if we're reading from file or string
  const isFile = !!options.file;
  let data: any;
  
  try {
    if (isFile) {
      // Validate file first
      const filePath = path.resolve(options.file!);
      const validation = validateJsonFile(filePath);
      
      if (!validation.valid) {
        console.error(chalk.red(`Error: ${validation.error}`));
        console.error(chalk.gray(`File: ${filePath}`));
        process.exit(1);
      }
      
      data = validation.data;
    } else if (jsonStr) {
      // Parse JSON string directly
      try {
        data = JSON.parse(jsonStr);
      } catch (e) {
        const error = e as Error;
        console.error(chalk.red(`Error: Invalid JSON string - ${error.message}`));
        process.exit(1);
      }
    } else {
      console.error('Error: Either a JSON string or --file <path> must be provided.');
      process.exit(1);
    }
    
    // Validate template structure
    const structureValidation = validateTemplateStructure(data);
    if (!structureValidation.valid) {
      console.error(chalk.red(`Error: Invalid template structure - ${structureValidation.error}`));
      process.exit(1);
    }
    
    // Check for full config object
    if (data && data.templates && typeof data.templates === 'object') {
      console.error(chalk.red('Error: The provided JSON appears to be a full configuration file, not a single template.'));
      console.error(chalk.gray('If you want to import a specific template from it, extract that template object first.'));
      process.exit(1);
    }

    config.templates[name] = data;
    saveConfig(config);
    console.log(chalk.green(`✓ Template "${name}" saved successfully.`));
  } catch (e) {
    const error = e as Error;
    console.error(chalk.red(`Failed to process template: ${error.message}`));
    process.exit(1);
  }
}
