#!/usr/bin/env bash
set -e

echo "=== AI CHAT LAYOUT DIAGNOSIS ==="
echo ""

echo "1. Cari file AI chat / contextual bar / markdown renderer"
grep -RInE "AIChatWidget|AIContextualBar|AITEM|markdown|ReactMarkdown|remark|prose|table|overflow-x|whitespace|break-words|break-all" src/components src/pages src/lib 2>/dev/null | head -300 || true

echo ""
echo "2. Cek AIChatWidget structure sekitar render message"
if [ -f src/components/AIChatWidget.tsx ]; then
  echo "--- src/components/AIChatWidget.tsx relevant lines ---"
  grep -nE "message|content|dangerouslySetInnerHTML|ReactMarkdown|markdown|table|prose|overflow|whitespace|break|scroll|textarea|input|AITEM" src/components/AIChatWidget.tsx | head -220 || true
fi

echo ""
echo "3. Cek AIContextualBar kalau ikut pakai renderer sama"
if [ -f src/components/AIContextualBar.tsx ]; then
  echo "--- src/components/AIContextualBar.tsx relevant lines ---"
  grep -nE "message|content|dangerouslySetInnerHTML|ReactMarkdown|markdown|table|prose|overflow|whitespace|break|scroll|textarea|input|AITEM" src/components/AIContextualBar.tsx | head -220 || true
fi

echo ""
echo "4. Cari CSS global yang mempengaruhi table/prose/chat"
grep -RInE "\.prose|table|th|td|overflow-x|whitespace|word-break|overflow-wrap|break-word|break-all|AI|chat|message|textarea" src/index.css src/**/*.css 2>/dev/null | head -260 || true

echo ""
echo "5. Cari class Tailwind raw di AI chat yang rawan bikin tabel melebar"
grep -RInE "min-w|w-\\[|max-w|overflow-hidden|overflow-x-auto|whitespace-nowrap|text-\\[|leading-|font-|grid-cols|table-auto|table-fixed" src/components/AIChatWidget.tsx src/components/AIContextualBar.tsx src/components 2>/dev/null | head -260 || true

echo ""
echo "6. Cek package markdown dependencies"
cat package.json | grep -nE "react-markdown|remark|rehype|marked|markdown-it|dompurify" || true

echo ""
echo "7. DONE"
echo "Kirim output ini ke ChatGPT. Yang dicari: apakah AI answer dirender sebagai raw HTML/markdown table tanpa wrapper overflow-x-auto dan tanpa table responsive CSS."
