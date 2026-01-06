import { track } from '@vercel/analytics';

/**
 * Track user click actions for Vercel Analytics
 * All events are automatically sent to Vercel's dashboard
 */

// Agent interactions
export function trackAgentLaunch(repo: string, model: string) {
  track('agent_launch', { repo, model });
}

export function trackAgentSelect(agentId: string, status: string) {
  track('agent_select', { agentId, status });
}

export function trackAgentFollowUp(agentId: string) {
  track('agent_follow_up', { agentId });
}

// Repository interactions
export function trackRepoSelect(repo: string) {
  track('repo_select', { repo });
}

export function trackRepoPickerOpen() {
  track('repo_picker_open');
}

// Navigation
export function trackBackToHome() {
  track('back_to_home');
}

export function trackGitHubLinkClick(url: string) {
  track('github_link_click', { url });
}

export function trackDashboardLinkClick() {
  track('dashboard_link_click');
}

// Auth actions
export function trackApiKeySubmit() {
  track('api_key_submit');
}

export function trackLogout() {
  track('logout');
}

// UI interactions
export function trackUserMenuOpen() {
  track('user_menu_open');
}

export function trackComposerSubmit(hasActiveAgent: boolean) {
  track('composer_submit', { hasActiveAgent });
}

export function trackSearchInput() {
  track('search_input');
}
