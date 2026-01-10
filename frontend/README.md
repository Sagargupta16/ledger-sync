# Ledger Sync Frontend

Modern, beautiful web interface for the Ledger Sync application built with the latest frontend technologies.

## 🚀 Tech Stack

- **Next.js 15** - Latest React framework with App Router
- **React 19** - Latest React with modern features
- **TypeScript 5.7** - Full type safety
- **Tailwind CSS 3.4** - Modern utility-first styling
- **shadcn/ui** - Beautiful, accessible component library
- **Radix UI** - Headless UI primitives
- **Lucide React** - Modern icon library
- **Axios** - HTTP client for API calls

## 📦 Installation

### Prerequisites

- Node.js 18+
- npm or yarn

### Setup Steps

1. **Navigate to frontend directory:**

   ```bash
   cd frontend
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Configure environment:**
   The `.env.local` file is already configured with:

   ```
   NEXT_PUBLIC_API_URL=http://localhost:8000
   ```

4. **Run development server:**

   ```bash
   npm run dev
   ```

5. **Open in browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 🎯 Features

- **Drag & Drop Upload** - Intuitive file upload with drag-and-drop support
- **Real-time Feedback** - Beautiful toast notifications with upload statistics
- **Modern UI/UX** - Clean, gradient-based design with smooth animations
- **Responsive Design** - Works perfectly on all screen sizes
- **Type Safety** - Full TypeScript coverage
- **Error Handling** - Comprehensive error messages and user feedback
- **Statistics Display** - Visual breakdown of sync operations (processed, inserted, updated, deleted, unchanged)

## 📁 Project Structure

```
frontend/
├── app/
│   ├── layout.tsx       # Root layout with toast provider
│   ├── page.tsx         # Main landing page
│   └── globals.css      # Global styles with Tailwind
├── components/
│   ├── FileUpload.tsx   # Main upload component
│   └── ui/              # shadcn/ui components
│       ├── button.tsx
│       ├── card.tsx
│       ├── input.tsx
│       ├── toast.tsx
│       └── toaster.tsx
├── hooks/
│   └── use-toast.ts     # Toast notification hook
├── lib/
│   └── utils.ts         # Utility functions
└── package.json
```

## 🔌 API Integration

The frontend communicates with the FastAPI backend running on `http://localhost:8000`.

### Endpoints Used:

- `POST /api/upload` - Upload and process Excel files
  - Accepts: `multipart/form-data` with file
  - Returns: Upload statistics and success message

## 🎨 UI Components

Built with **shadcn/ui** components:

- **Button** - Primary action buttons with loading states
- **Card** - Content containers with headers
- **Input** - File input with custom styling
- **Toast** - Notification system with variants (success, error)

## 🚦 Usage

1. **Upload File:**

   - Click the upload area or drag-and-drop an Excel file (.xlsx, .xls)
   - File name and size will be displayed

2. **Sync Database:**

   - Click "Upload & Sync" button
   - Watch the loading animation

3. **View Results:**
   - Toast notification appears with detailed statistics
   - Statistics card shows breakdown of all operations
   - Success/error messages guide next steps

## 🛠️ Development

### Available Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run ESLint
```

### Adding New Components

To add new shadcn/ui components:

```bash
npx shadcn@latest add [component-name]
```

## 🌈 Customization

### Theme

Colors are defined in `tailwind.config.ts` and use CSS variables in `app/globals.css`. Modify the HSL values to change the color scheme:

```css
:root {
  --primary: 240 5.9% 10%;
  --secondary: 240 4.8% 95.9%;
  /* ... more colors */
}
```

### API URL

Update the API URL in `.env.local`:

```
NEXT_PUBLIC_API_URL=http://your-api-url:port
```

## 📱 Responsive Design

The interface is fully responsive:

- **Mobile:** Single column layout
- **Tablet:** 2-column stats grid
- **Desktop:** Full 5-column stats display

## 🐛 Troubleshooting

### Port Already in Use

If port 3000 is busy:

```bash
npm run dev -- -p 3001
```

### API Connection Issues

1. Ensure backend is running on port 8000
2. Check CORS settings in backend allow `localhost:3000`
3. Verify `.env.local` has correct API URL

### Build Errors

Clear cache and reinstall:

```bash
rm -rf .next node_modules
npm install
npm run dev
```

## 🚀 Production Deployment

### Build

```bash
npm run build
```

### Start Production Server

```bash
npm start
```

### Environment Variables

For production, set:

```
NEXT_PUBLIC_API_URL=https://your-production-api.com
```

## 📄 License

Part of the Ledger Sync project.

---

**Built with ❤️ using Next.js 15 and modern web technologies**
