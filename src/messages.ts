// Plain-language text for every error a user can hit (PLAN.md §3).
import { GitHubError } from './github/client';

export interface UserMessage {
  title: string;
  detail: string;
}

function time(d: Date | undefined): string {
  return d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'within the hour';
}

export function messageFor(err: unknown): UserMessage {
  if (!(err instanceof GitHubError)) {
    return { title: 'Something went wrong', detail: 'An unexpected problem stopped the analysis. Please try again.' };
  }
  switch (err.kind) {
    case 'invalid-input':
      return { title: 'Please check what you typed', detail: err.message };
    case 'not-found':
      return {
        title: "We couldn't find that repository",
        detail: 'Check the spelling (owner/name, for example grafana/grafana). It may also be private: this tool only works with public repositories.',
      };
    case 'private':
      return {
        title: 'This repository is private',
        detail: 'Only public repositories are supported. Try a public one instead.',
      };
    case 'no-deployments':
      return {
        title: 'Nothing to measure in this period',
        detail: 'We found no releases or version tags in the selected dates. Try a longer period, or change "What counts as a deployment" under Settings.',
      };
    case 'rate-limit':
      return err.withToken
        ? {
            title: "Your token's hourly limit is used up",
            detail: `GitHub allows 5,000 requests per hour with a token. It resets at about ${time(err.resetAt)}; please try again then.`,
          }
        : {
            title: "GitHub's hourly limit is used up",
            detail: `Without a token GitHub allows 60 requests per hour. It resets at about ${time(err.resetAt)}. To continue now, add a GitHub token (see "Why a token?").`,
          };
    case 'network':
      return {
        title: "Couldn't reach GitHub",
        detail: 'Check your internet connection and try again. A company network or browser extension may also be blocking api.github.com.',
      };
    case 'bad-token':
      return {
        title: 'GitHub did not accept the token',
        detail: 'The token may be mistyped, expired or revoked. Fix it, or clear the token field to continue without one.',
      };
    case 'forbidden':
      return {
        title: 'GitHub refused access',
        detail: 'GitHub blocked this request. If you added a token, check it can read public repositories, or try without it.',
      };
    case 'server':
      return { title: 'GitHub had a problem', detail: 'GitHub returned an error. Please wait a minute and try again.' };
    case 'budget':
      return {
        title: 'This repository is too large to read without a token',
        detail: 'It has so many version tags that just reading their dates needs more requests than GitHub allows per hour without a token. Add a GitHub token (see "Why a token?") to analyse it.',
      };
  }
}
