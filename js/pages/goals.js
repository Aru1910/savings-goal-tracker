import { query } from '../analytics.js';
import { pageHead, goalCard, emptyState, muted } from '../components.js';

export function renderGoalGrid(goals, state) {
  if (!goals.length) {
    return emptyState('No goals yet', 'Create your first goal or load sample data to explore the app.',
      '<button class="btn btn-primary" data-act="new" type="button">Create a goal</button><button class="btn" data-act="sample" type="button">Try sample data</button>');
  }
  const list = query(goals, state);
  if (!list.length) return emptyState('No matching goals', 'Try a different search or filter.');
  return list.map(goalCard).join('');
}

const options = (items, current) =>
  items.map(([value, label]) => `<option value="${value}"${value === current ? ' selected' : ''}>${label}</option>`).join('');

export function renderGoals(data, state) {
  return (
    pageHead('Goals', 'Everything you are saving for.', '<button class="btn btn-primary" data-act="new" type="button">New goal <kbd class="rounded bg-green-100 px-1.5 text-xs text-green-800">N</kbd></button>') +
    `<section class="mb-4 flex flex-wrap gap-2.5" aria-label="Filters">` +
    `<input data-filter="q" type="search" value="${state.q.replace(/"/g, '&quot;')}" placeholder="Search goals  ( / )" aria-label="Search goals" class="field min-w-[180px] flex-1" id="search">` +
    `<select data-filter="filter" aria-label="Filter by status" class="field !w-auto">${options([['all', 'All goals'], ['active', 'In progress'], ['done', 'Completed']], state.filter)}</select>` +
    `<select data-filter="priority" aria-label="Filter by priority" class="field !w-auto">${options([['all', 'Any priority'], ['High', 'High'], ['Medium', 'Medium'], ['Low', 'Low']], state.priority)}</select>` +
    `<select data-filter="sort" aria-label="Sort goals" class="field !w-auto">${options([['recent', 'Newest first'], ['progress', 'Highest progress'], ['deadline', 'Nearest deadline'], ['priority', 'Priority'], ['target', 'Largest target']], state.sort)}</select>` +
    `</section><div id="goalGrid" class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">${renderGoalGrid(data.goals, state)}</div>`
  );
}
