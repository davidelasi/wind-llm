'use client';

import Navigation from '@/components/Navigation';

export default function About() {
  return (
    <div className="min-h-screen bg-gray-100">
      <Navigation />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-lg p-6 md:p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">About This Project</h1>

          {/* Hero Image */}
          <div className="mb-8">
            <img
              src="/images/about-wingfoiling.jpg"
              alt="Wingfoiling at Cabrillo Beach"
              className="rounded-lg shadow-md w-full"
              loading="eager"
            />
          </div>

          {/* Introduction */}
          <div className="prose prose-gray max-w-none space-y-4 text-gray-700 leading-relaxed">
            <p>
              I am passionate about all possible combinations of water and wind. Been there with: sailing, windsurfing, kitesurfing (twintip, foil, surf), and since last year wingfoiling!
            </p>

            <p>
              This app is my deep-dive into AI coding tools. Since there is no better way to learn a skill than to apply it to something you love, I figured I might as well code my own system to forecast the wind at my home spot. That's the motivation behind this site, besides giving my kitefoiling and wingfoiling friends yet another tool on which to waste some time to decide if it's a day worth going to the beach (answer: it's always a day worth going to the beach with friends, no matter the wind).
            </p>

            <p>
              Through this little journey, I learned to appreciate the different personalities of Anthropic's Claude Code and ChatGPT Codex. I even made some experiments with Cline and the free coding model of Grok. I came to like Claude Code CLI better (for now) although running daily into session limits on the pro plan has been both frustrating and refreshing, as it made me take healthy breaks in-between series of vibe coding sessions.
            </p>

            <p>
              I went from zero to one, so to say, in my vibe-coding learning journey with this app, and I tried different tools at different times, so the final code may not be the most elegant example of what can be achieved with these coding tools, when operated by an experienced pilot. But I have an aspirational goal of continuing to make this app more robust and faster, improving modularity and simplifying where possible, especially if this turns out to be a useful tool (which I'll personally test on a weekly basis).
            </p>

            <p>
              99% of the code has been made by Claude Code. Rarely did I go myself into the code to change something. The deepest coding dives in my life have been in Fortran 77 and C, at the time when Mac laptops were running on G4 processors. Far enough to be useless to debug the vagaries of Node.js. The bulk of my heavy-lifting as human-in-the-loop went into ensuring that AI actually did what it was supposed to do and not something else, especially when dealing with data processing (forecasts and wind parsing for training data sets, etc.). Data curation was one of the deepest sources of rabbit holes.
            </p>

            <p>
              The key lessons I learned through this work is that vibe-coding is not much different than managing a technical team, which is what I do for a living. Clarity of intent and requirements, defining and executing upon a sound roadmap, identifying the key decision points (and asking the help of the AI to make tradeoffs and decisions), and frequent auditing of the work done at a technical level, are key for success. Another important element for success with a team is a sound strategy to divide-and-conquer the problem. I am sure that AI coding tools can go much deeper with that using agents, but I've barely scratched the surface of this topic with this project.
            </p>

            <p>
              If you are interested to talk more about this app, AI, new technologies, kitesurfing or wingfoiling, let's connect on{' '}
              <a
                href="https://www.linkedin.com/in/davidelasi/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#005F73] hover:text-[#0A9396] underline font-medium"
              >
                LinkedIn
              </a>
              {' '}or see you pretty much any windy weekend at Cabrillo Beach or Belmont Shore!
            </p>

            <p className="text-2xl font-bold text-center mt-8">
              CIAO!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
