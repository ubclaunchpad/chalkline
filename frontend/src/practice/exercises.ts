// System-design practice exercises. Each rubric is checked live from the diagram.

import {
  cacheInFrontOfDatabase,
  clientReachesDatabase,
  databaseReplicas,
  hasKind,
  servicesScaleOut,
  twoWayClient,
  writesThroughQueue,
  type RubricItem,
} from './rubric'

export interface Exercise {
  id: string
  title: string
  prompt: string
  functional: string[]
  nonFunctional: string[]
  constraints: string[]
  hints: string[]
  rubric: RubricItem[]
}

const loadBalancer = hasKind(
  'load_balancer',
  'Has a load balancer',
  'Add a load balancer so traffic is spread across servers.',
)
const monitoring = hasKind(
  'monitoring',
  'Has monitoring',
  'Add monitoring so you find out about problems before users do.',
)

export const EXERCISES: readonly Exercise[] = [
  {
    id: 'url-shortener',
    title: 'URL shortener',
    prompt:
      'Design a service like bit.ly that turns long links into short ones and redirects visitors.',
    functional: [
      'Create a short link from a long URL',
      'Visiting a short link redirects to the long URL',
      'Links can expire',
    ],
    nonFunctional: [
      'Redirects feel instant',
      'Highly available: broken links are very visible',
      'Short codes are hard to guess',
    ],
    constraints: [
      '100M redirects/day',
      '1M new links/day',
      'Reads outnumber writes 100 to 1',
    ],
    hints: [
      'Redirects are almost all reads. What can answer them without touching the database?',
      'Popular links are read again and again: a cache in front of the database helps most.',
      'One database copy is a single point of failure. Add replicas.',
    ],
    rubric: [
      clientReachesDatabase,
      loadBalancer,
      cacheInFrontOfDatabase,
      databaseReplicas(2),
      monitoring,
    ],
  },
  {
    id: 'chat-app',
    title: 'Chat app',
    prompt:
      'Design a messaging app like WhatsApp with one-to-one and group chats.',
    functional: [
      'Send and receive messages in real time',
      'Group chats up to 500 people',
      'See message history on any device',
    ],
    nonFunctional: [
      'Messages arrive in under a second',
      'No message is ever lost',
      'Works on flaky mobile networks',
    ],
    constraints: [
      '50M daily users',
      '2B messages/day',
      'Users stay connected for hours',
    ],
    hints: [
      'Polling for new messages wastes battery. How can the server push instead?',
      'Sending to a group means fanning one message out to many people. Pub/sub fits.',
      'Message history must survive a database failure.',
    ],
    rubric: [
      twoWayClient,
      writesThroughQueue,
      loadBalancer,
      databaseReplicas(2),
      monitoring,
    ],
  },
  {
    id: 'ride-sharing',
    title: 'Ride sharing',
    prompt:
      'Design a ride-hailing app like Uber that matches riders with nearby drivers.',
    functional: [
      'Riders request a ride and see nearby drivers',
      'Drivers send their location every few seconds',
      'Match a rider to a driver and track the trip',
    ],
    nonFunctional: [
      'Matching takes a few seconds at most',
      'Location updates never block the app',
      'Trips and payments are never lost',
    ],
    constraints: [
      '1M active drivers',
      'A location update every 4 seconds per driver',
      '20M rides/day',
    ],
    hints: [
      '1M drivers every 4 seconds is 250k writes per second. Buffer them.',
      'Current driver locations change constantly: keep them in a fast in-memory store.',
      'Run the matching service on several instances behind a load balancer.',
    ],
    rubric: [
      loadBalancer,
      writesThroughQueue,
      cacheInFrontOfDatabase,
      servicesScaleOut,
      databaseReplicas(2),
      monitoring,
    ],
  },
  {
    id: 'news-feed',
    title: 'News feed',
    prompt:
      'Design a social news feed like Twitter or Instagram where people see posts from those they follow.',
    functional: [
      'Publish a post with text and images',
      'See a feed of posts from people you follow',
      'Feeds update soon after someone posts',
    ],
    nonFunctional: [
      'Feeds load in under 200 ms',
      'Images load fast worldwide',
      'Posting stays fast for accounts with millions of followers',
    ],
    constraints: [
      '300M daily users',
      '500M feed reads/day',
      '10M new posts/day',
    ],
    hints: [
      'Images are large and never change. Where should they live, and who serves them?',
      'Building a feed on every read is slow. Precompute feeds and keep them cached.',
      'When someone posts, hand the fan-out to a queue so posting stays fast.',
    ],
    rubric: [
      hasKind(
        'object_storage',
        'Images live in object storage',
        'Add object storage for images and video.',
      ),
      hasKind(
        'cdn',
        'Has a CDN for media',
        'Add a CDN so media loads fast worldwide.',
      ),
      cacheInFrontOfDatabase,
      writesThroughQueue,
      loadBalancer,
      monitoring,
    ],
  },
]
