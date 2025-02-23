import { ModelHashType, ModelModifier } from '@prisma/client';
import { NextApiRequest, NextApiResponse } from 'next';
import { Session } from 'next-auth';
import { z } from 'zod';

import { getEdgeUrl } from '~/client-utils/cf-images-utils';
import { BrowsingMode } from '~/server/common/enums';
import { createModelFileDownloadUrl } from '~/server/common/model-helpers';
import { GetAllModelsInput, getAllModelsSchema } from '~/server/schema/model.schema';
import { getDownloadFilename } from '~/server/services/file.service';
import { getModelsWithVersions } from '~/server/services/model.service';
import { MixedAuthEndpoint, handleEndpointError } from '~/server/utils/endpoint-helpers';
import { getPrimaryFile } from '~/server/utils/model-helpers';
import { getNextPage, getPagination } from '~/server/utils/pagination-helpers';
import { booleanString } from '~/utils/zod-helpers';

type Metadata = {
  currentPage?: number;
  pageSize?: number;
  nextCursor?: string | bigint | Date;
  nextPage?: string;
};

export const config = {
  api: {
    responseLimit: false,
  },
};

const hashesAsObject = (hashes: { type: ModelHashType; hash: string }[]) =>
  hashes.reduce((acc, { type, hash }) => ({ ...acc, [type]: hash }), {});

const authedOnlyOptions: Array<keyof GetAllModelsInput> = ['favorites', 'hidden'];

const modelsEndpointSchema = getAllModelsSchema.omit({ browsingMode: true }).extend({
  limit: z.preprocess((val) => Number(val), z.number().min(0).max(100)).default(100),
  nsfw: booleanString().optional(),
  primaryFileOnly: booleanString().optional(),
});

export default MixedAuthEndpoint(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  user: Session['user'] | undefined
) {
  if (
    Object.keys(req.query).some((key) =>
      authedOnlyOptions.includes(key as keyof GetAllModelsInput)
    ) &&
    !user
  )
    return res.status(401).json({ error: 'Unauthorized' });

  const parsedParams = modelsEndpointSchema.safeParse(req.query);
  if (!parsedParams.success) return res.status(400).json({ error: parsedParams.error });

  // Handle pagination
  const { limit, page, cursor, ...data } = parsedParams.data;
  let skip: number | undefined;
  const usingPaging = page && !cursor;
  if (usingPaging) {
    ({ skip } = getPagination(limit, page));
    if (skip && skip * limit > 10000)
      // Enforce new paging limit
      return res
        .status(429)
        .json({ error: "You've requested too many pages, please use cursors instead" });
  }
  const browsingMode = data.nsfw === false ? BrowsingMode.SFW : BrowsingMode.All;

  try {
    const { items, nextCursor } = await getModelsWithVersions({
      input: { ...data, take: limit, skip, cursor, browsingMode },
      user,
    });

    const preferredFormat = {
      type: user?.filePreferences?.size === 'pruned' ? 'Pruned Model' : undefined,
      metadata: user?.filePreferences,
    };
    const primaryFileOnly = data.primaryFileOnly === true;

    const { baseUrl, nextPage } = getNextPage({ req, nextCursor });
    const metadata: Metadata = { nextCursor, nextPage };
    if (usingPaging) {
      metadata.currentPage = page;
      metadata.pageSize = limit;
    }

    return res.status(200).json({
      items: items.map(({ modelVersions, tagsOnModels, user, ...model }) => ({
        ...model,
        mode: model.mode == null ? undefined : model.mode,
        creator: user
          ? {
              username: user.username,
              image: user.image ? getEdgeUrl(user.image, { width: 96, name: user.username }) : null,
            }
          : undefined,
        tags: tagsOnModels.map(({ name }) => name),
        modelVersions: modelVersions
          .filter((x) => x.status === 'Published')
          .map(({ status, files, images, createdAt, ...version }) => {
            let castedFiles =
              (files as Array<
                Omit<(typeof files)[number], 'metadata'> & { metadata: FileMetadata }
              >) ?? [];
            const primaryFile = getPrimaryFile(castedFiles, preferredFormat);
            if (!primaryFile) return null;
            if (primaryFileOnly) castedFiles = [primaryFile];

            const includeDownloadUrl = model.mode !== ModelModifier.Archived;
            const includeImages = model.mode !== ModelModifier.TakenDown;

            return {
              ...version,
              files: includeDownloadUrl
                ? castedFiles.map(({ hashes, ...file }) => ({
                    ...file,
                    name: getDownloadFilename({ model, modelVersion: version, file }),
                    hashes: hashesAsObject(hashes),
                    downloadUrl: `${baseUrl.origin}${createModelFileDownloadUrl({
                      versionId: version.id,
                      type: file.type,
                      meta: file.metadata,
                      primary: primaryFile.id === file.id,
                    })}`,
                    primary: primaryFile.id === file.id ? true : undefined,
                    url: undefined,
                    visibility: undefined,
                  }))
                : [],
              images: includeImages
                ? images.map(({ url, id, ...image }) => ({
                    id,
                    url: getEdgeUrl(url, { width: 450, name: id.toString() }),
                    ...image,
                  }))
                : [],
              downloadUrl: includeDownloadUrl
                ? `${baseUrl.origin}${createModelFileDownloadUrl({
                    versionId: version.id,
                    primary: true,
                  })}`
                : undefined,
            };
          })
          .filter((x) => x),
      })),
      metadata: { ...metadata },
    });
  } catch (e) {
    return handleEndpointError(res, e);
  }
});
