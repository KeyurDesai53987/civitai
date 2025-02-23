import { MetricTimeframe } from '@prisma/client';
import { useMemo } from 'react';
import { z } from 'zod';
import { useZodRouteParams } from '~/hooks/useZodRouteParams';

import { useFiltersContext } from '~/providers/FiltersProvider';
import { ArticleSort } from '~/server/common/enums';
import { GetInfiniteArticlesSchema } from '~/server/schema/article.schema';
import { removeEmpty } from '~/utils/object-helpers';
import { trpc } from '~/utils/trpc';
import { booleanString, numericString, numericStringArray } from '~/utils/zod-helpers';
import { useApplyHiddenPreferences } from '~/components/HiddenPreferences/useApplyHiddenPreferences';

export const useArticleFilters = () => {
  const storeFilters = useFiltersContext((state) => state.articles);
  return removeEmpty(storeFilters);
};

const articleQueryParamSchema = z
  .object({
    tags: numericStringArray(),
    view: z.enum(['categories', 'feed']),
    period: z.nativeEnum(MetricTimeframe),
    sort: z.nativeEnum(ArticleSort),
    section: z.enum(['published', 'draft']),
    favorites: booleanString(),
    hidden: booleanString(),
    username: z.string(),
    collectionId: numericString(),
    followed: z.coerce.boolean(),
  })
  .partial();
export const useArticleQueryParams = () => useZodRouteParams(articleQueryParamSchema);
export type ArticleQueryParams = z.output<typeof articleQueryParamSchema>;
// export const useArticleQueryParams = () => {
//   const { query, pathname, replace } = useRouter();

//   return useMemo(() => {
//     const result = articleQueryParamSchema.safeParse(query);
//     const data: ArticleQueryParams = result.success ? result.data : { view: 'categories' };

//     return {
//       ...data,
//       replace: (filters: Partial<ArticleQueryParams>) => {
//         replace({ pathname, query: { ...query, ...filters } }, undefined, { shallow: true });
//       },
//     };
//   }, [query, pathname, replace]);
// };

export const useQueryArticles = (
  filters?: Partial<GetInfiniteArticlesSchema>,
  options?: { keepPreviousData?: boolean; enabled?: boolean; applyHiddenPreferences?: boolean }
) => {
  filters ??= {};
  const { applyHiddenPreferences = true, ...queryOptions } = options ?? {};
  const browsingMode = useFiltersContext((state) => state.browsingMode);
  const { data, isLoading, ...rest } = trpc.article.getInfinite.useInfiniteQuery(
    { ...filters, browsingMode },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      trpc: { context: { skipBatch: true } },
      ...queryOptions,
    }
  );

  const flatData = useMemo(() => data?.pages.flatMap((x) => x.items) ?? [], [data]);
  const { items, loadingPreferences, hiddenCount } = useApplyHiddenPreferences({
    type: 'articles',
    data: flatData,
    showHidden: !!filters.hidden,
    disabled: !applyHiddenPreferences,
  });

  return {
    data,
    articles: items,
    removedArticles: hiddenCount,
    fetchedArticles: flatData?.length,
    isLoading: isLoading || loadingPreferences,
    ...rest,
  };
};
