# Cursor Cloud

A web interface for launching and managing Cursor Cloud Agents.

## Features

- Launch cloud agents on any connected GitHub repository
- Real-time conversation view with agent progress
- Activity history with recent runs
- Model selection (composer-1, opus-4.5, gpt-5.2)

## Fun Fact 🐧

Why don't penguins like talking to strangers at parties? Because they break the ice!

## Development Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) and enter your Cursor API key.

## Getting an API Key

Get your API key from [cursor.com/dashboard](https://cursor.com/dashboard). Your key is stored locally in your browser and never sent to any server other than Cursor's API.

## Production Deployment

### Build

Build the production bundle:
```bash
npm run build
```

### Environment Variables

No environment variables are required for basic operation. The application runs entirely client-side with API keys stored in the browser's localStorage.

Optional environment variables:
- `NODE_ENV`: Set to `production` for production builds (automatically set by most deployment platforms)

### Deployment

This is a Next.js application that can be deployed to:

- **Vercel** (recommended): Connect your GitHub repository and deploy automatically
- **Netlify**: Use the Next.js build preset
- **Docker**: Build with `docker build -t cursor-web .` (requires Dockerfile)
- **Any Node.js hosting**: Run `npm run build && npm start`

### Health Check

The application includes a health check endpoint at `/api/health` for monitoring and load balancer health checks.

### Security Features

- ✅ Security headers (HSTS, X-Frame-Options, CSP, etc.)
- ✅ API route validation and rate limiting
- ✅ Input sanitization and path traversal protection
- ✅ Error boundaries for graceful error handling
- ✅ Request size limits and timeout protection

### Monitoring

- Vercel Analytics is integrated for usage tracking
- Error logging is configured (can be extended with Sentry or similar)
- Health check endpoint available at `/api/health`

### Performance

- Optimized Next.js build with production optimizations
- Image optimization enabled
- Static asset caching configured
- Code splitting and lazy loading

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
