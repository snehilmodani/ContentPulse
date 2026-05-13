import pRetry from 'p-retry';

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export class ResendClient {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async send(options: SendEmailOptions): Promise<void> {
    if (!this.apiKey) {
      process.stdout.write(`[STUB] Email to ${options.to}: ${options.subject}\n`);
      return;
    }

    await pRetry(
      async () => {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'ContentPulse <hello@contentpulse.app>',
            to: options.to,
            subject: options.subject,
            html: options.html,
          }),
        });

        if (!response.ok) throw new Error(`Resend error: ${response.status}`);
      },
      { retries: 4, factor: 2, minTimeout: 1000 },
    );
  }
}
