import { Link } from "react-router-dom";
import HelpLayout from "@/components/help/HelpLayout";
import { HelpSection } from "@/components/help/HelpSection";

const SECTION = {
  id: "what-is-a-floor-trial",
  eyebrow: "01",
  title: "What is a floor trial?",
};

export default function HelpFloorTrialsPage() {
  return (
    <HelpLayout topicId="floor-trials" title="What is a floor trial?">
      <HelpSection section={SECTION}>
        <p>
          A floor trial is a chance to perform your competition routine in the actual ballroom, on
          the actual floor, with the actual sound system, before the real competition. The deejay
          plays your submitted music, you run your routine end-to-end, and you walk off with a much
          better sense of where the tricky moments are, how the audience side feels, and whether
          your levels need adjusting.
        </p>
        <p>
          Floor trials are scheduled in blocks throughout the event. Each block has its own check-in
          window, its own queue, and its own seat at the deejay booth.
        </p>
        <p>
          Before you can check in, you must{" "}
          <Link
            to="/how-it-works/submitting-music#event-submission-required"
            className="text-primary hover:underline"
          >
            submit your song to the event
          </Link>
          .
        </p>
      </HelpSection>
    </HelpLayout>
  );
}
