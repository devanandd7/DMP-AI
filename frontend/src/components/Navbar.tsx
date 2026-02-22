"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignInButton, SignUpButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

export default function Navbar() {
    const pathname = usePathname();
    const isHome = pathname === "/";

    // Build a link that either scrolls on the home page or navigates to home+hash
    const sectionHref = (hash: string) => (isHome ? hash : `/${hash}`);

    return (
        <nav className="navbar">
            {/* Logo */}
            <Link href="/" className="navbar-logo">
                <span className="logo-dot" />
                <span>DMP AI</span>
            </Link>

            {/* Links */}
            <ul className="navbar-links">
                <li><a href={sectionHref("#features")}>Features</a></li>
                <li><a href={sectionHref("#models")}>Models</a></li>
                <li><a href={sectionHref("#pricing")}>Pricing</a></li>
                <li>
                    {isHome ? (
                        // On home page — no separate docs page, smooth scroll to pricing / bottom
                        <a href="#pricing">Docs</a>
                    ) : (
                        // On dashboard — scroll to the API docs section inside the dashboard
                        <a
                            href="#docs-section"
                            onClick={(e) => {
                                e.preventDefault();
                                document.querySelector(".docs-section")?.scrollIntoView({ behavior: "smooth" });
                            }}
                        >
                            Docs
                        </a>
                    )}
                </li>
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
