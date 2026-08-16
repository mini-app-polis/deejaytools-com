import { Link } from "react-router-dom";

export default function HelpStillStuck() {
  return (
    <p className="text-sm text-muted-foreground pt-6 border-t border-white/[0.07]">
      Browse{" "}
      <Link to="/how-it-works/troubleshooting" className="text-primary hover:underline">
        Troubleshooting
      </Link>{" "}
      for common error messages, or{" "}
      <Link to="/feedback" className="text-primary hover:underline">
        send us a message
      </Link>{" "}
      — include what you were trying to do and the exact text you saw.
    </p>
  );
}
