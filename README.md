# Tweet Fetcher Worker

A Cloudflare Worker that fetches and processes tweets using Puppeteer. This worker provides a clean API to fetch tweet data including content, user information, media, and quoted tweets.

## Features

- Fetches tweet data including:
  - Tweet content
  - User information
  - Media (photos)
  - Quoted tweets
  - Hashtags
  - URLs
  - User mentions
- Handles session management for Puppeteer
- Caching support (via KV storage)
- Error handling for invalid tweets

## Prerequisites

- Node.js
- npm
- Cloudflare account
- Cloudflare Workers CLI (wrangler)

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure your Cloudflare Workers environment:
   - Create a `wrangler.jsonc` file with your configuration
   - Set up the required bindings:
     - `MYBROWSER`: Browser Worker binding
     - `BROWSER_KV_DEMO`: KV namespace for caching

## Development

To start the development server:

```bash
npm run dev
```

The worker will be available at `http://localhost:8787`

## API Usage

### Endpoint

```
POST /?id=<tweet_id>
```

### Response Format

```typescript
{
  data: {
    __typename: string;
    lang: string;
    created_at: string;
    tweet_id: string;
    hastags: string[];
    urls: { displayUrl: string; expandedUrl: string }[];
    user_mentions: { id: string; name: string; username: string }[];
    content: string;
    user: {
      id_str: string;
      name: string;
      profile_image_url_https?: string;
      screen_name: string;
      verified?: boolean;
      is_blue_verified?: boolean;
      profile_image_shape?: string;
    };
    photos: string[];
    quote_tweet: SanitizedTweet | null;
  }
}
```

## Deployment

To deploy the worker to Cloudflare:

```bash
npm run deploy
```

## Error Handling

The worker returns appropriate HTTP status codes:
- 400: No tweet ID provided
- 404: Tweet not found
- 500: Internal server error

## License

[MIT License](LICENSE) 