import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Mandate — Agent spending, on your terms',description:'An AI agent can propose a purchase. Your rules decide whether money moves. PayPal sandbox prototype.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
