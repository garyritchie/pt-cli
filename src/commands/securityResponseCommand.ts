// pt-cli/src/commands/securityResponseCommand.ts
// CLI command to handle security responses from GUI

import { handleSecurityResponse } from '../safety.js';

export interface SecurityResponseOptions {
  response: string;
}

export async function securityResponseCommand(response: string, options: SecurityResponseOptions = { response: '' }): Promise<void> {
  const result = await handleSecurityResponse(response);
  
  if (result) {
    console.log('SECURITY_RESPONSE:ALLOWED');
  } else {
    console.log('SECURITY_RESPONSE:DENIED');
  }
}