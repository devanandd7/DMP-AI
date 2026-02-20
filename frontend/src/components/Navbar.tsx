"use client";

import Link from "next/link";
import { SignInButton, SignUpButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

export default function Navbar() {
    return (
        <nav className="navbar">
            {/* Logo */}
            <Link href="/" className="navbar-logo">
                <span className="logo-dot" />
                <span>DMP AI</span>
            </Link>

            {/* Links */}
            <ul className="navbar-links">
                <li><a href="#features">Features</a></li>
                <li><a href="#models">Models</a></li>
                <li><a href="#pricing">Pricing</a></li>
                <li><a href="/docs" target="_blank">Docs</a></li>
            </ul>

            {/* Auth Actions */}
            <div className="navbar-actions">
                <SignedOut>
                    <SignInButton mode="modal">
                        <button className="btn btn-ghost btn-sm">Sign In</button>
                    </SignInButton>
                    <SignUpButton mode="modal">
                        <button className="btn btn-primary btn-sm">Get API Key</button>
                    </SignUpButton>
                </SignedOut>
                <SignedIn>
                    <Link href="/dashboard">
                        <button className="btn btn-ghost btn-sm">Dashboard</button>
                    </Link>
                    <UserButton afterSignOutUrl="/" />
                </SignedIn>
            </div>
        </nav>
    );
}
