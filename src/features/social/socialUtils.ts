import type { SocialStory } from "./types";

export type StoryGroup = {
  authorId: string;
  author: SocialStory["author"];
  stories: SocialStory[];
  hasUnseen: boolean;
};

export function groupStoriesByAuthor(stories: SocialStory[]): StoryGroup[] {
  const groups = new Map<string, StoryGroup>();
  for (const story of stories) {
    const current = groups.get(story.author.id);
    if (current) {
      current.stories.push(story);
      current.hasUnseen ||= !story.seen;
      continue;
    }
    groups.set(story.author.id, {
      authorId: story.author.id,
      author: story.author,
      stories: [story],
      hasUnseen: !story.seen,
    });
  }
  return [...groups.values()].map((group) => ({
    ...group,
    stories: [...group.stories].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    ),
  }));
}
export function flattenStoryGroups(groups: StoryGroup[], firstAuthorId?: string) {
  if (!firstAuthorId) return groups.flatMap((group) => group.stories);
  const index = groups.findIndex((group) => group.authorId === firstAuthorId);
  if (index < 1) return groups.flatMap((group) => group.stories);
  return [...groups.slice(index), ...groups.slice(0, index)].flatMap(
    (group) => group.stories,
  );
}
