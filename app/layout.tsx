import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {title:"Quizhunter · Your personal study studio",description:"Understand your PowerPoint slides with detailed explanations, flashcards, and practice quizzes.",icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
