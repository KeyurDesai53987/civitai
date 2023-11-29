import {
  ActionIcon,
  Group,
  Text,
  Tooltip,
  TooltipProps,
  LoadingOverlay,
  Card,
  BoxProps,
  Box,
} from '@mantine/core';
import { openConfirmModal } from '@mantine/modals';
import { IconCloudUpload, IconSquareOff, IconTrash, IconWindowMaximize } from '@tabler/icons-react';
import { useRouter } from 'next/router';
import { generationImageSelect } from '~/components/ImageGeneration/utils/generationImage.select';
import {
  useDeleteGenerationRequestImages,
  useGetGenerationRequests,
} from '~/components/ImageGeneration/utils/generationRequestHooks';
import { constants } from '~/server/common/constants';
import { generationPanel } from '~/store/generation.store';
import { postImageTransmitter } from '~/store/post-image-transmitter.store';
import { trpc } from '~/utils/trpc';
import { isDefined } from '~/utils/type-guards';
import { showErrorNotification } from '~/utils/notifications';

export function GeneratedImageActions(props: BoxProps) {
  const { selected, deselect, isMutating, deleteSelectedImages, postSelectedImages } =
    useGeneratedImageActions();

  if (!selected.length) return null;
  return (
    <Box {...props}>
      <Box sx={{ position: 'relative' }}>
        <LoadingOverlay visible={isMutating} loaderProps={{ variant: 'bars', size: 'sm' }} />
        <Group spacing={6} position="right">
          <Text color="dimmed" size="sm" weight={500} inline>
            {selected.length} selected
          </Text>
          <Group spacing={4}>
            <Tooltip label="Deselect all" {...tooltipProps}>
              <ActionIcon size="xl" onClick={deselect} variant="light">
                <IconSquareOff size={24} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Delete selected" {...tooltipProps}>
              <ActionIcon size="xl" onClick={deleteSelectedImages} color="red">
                <IconTrash size={24} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Post images" {...tooltipProps}>
              <ActionIcon size="xl" variant="light" onClick={postSelectedImages}>
                <IconCloudUpload size={24} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Upscale images" {...tooltipProps}>
              <span>
                <ActionIcon size="xl" variant="light" disabled>
                  <IconWindowMaximize size={24} />
                </ActionIcon>
              </span>
            </Tooltip>
          </Group>
        </Group>
      </Box>
    </Box>
  );
}

const tooltipProps: Omit<TooltipProps, 'children' | 'label'> = {
  withinPortal: true,
  withArrow: true,
  color: 'dark',
  // zIndex: constants.imageGeneration.drawerZIndex + 1,
};

export const useGeneratedImageActions = () => {
  const router = useRouter();
  const { images } = useGetGenerationRequests();

  const selected = generationImageSelect.useSelection();
  const deselect = () => generationImageSelect.setSelected([]);

  const createPostMutation = trpc.post.create.useMutation();
  const bulkDeleteImagesMutation = useDeleteGenerationRequestImages({
    onSuccess: () => deselect(),
  });

  const deleteSelectedImages = () => {
    openConfirmModal({
      title: 'Delete images',
      children:
        'Are you sure that you want to delete the selected images? This is a destructive action and cannot be undone.',
      labels: { cancel: 'Cancel', confirm: 'Yes, delete them' },
      confirmProps: { color: 'red' },
      onConfirm: () => bulkDeleteImagesMutation.mutate({ ids: selected }),
      zIndex: constants.imageGeneration.drawerZIndex + 2,
      centered: true,
    });
  };

  const isMutating = bulkDeleteImagesMutation.isLoading || createPostMutation.isLoading;

  const postSelectedImages = async () => {
    const selectedImages = images.filter((x) => selected.includes(x.id));
    const files = (
      await Promise.all(
        selectedImages.map(async (image) => {
          const result = await fetch(image.url);
          if (!result.ok) return;
          const blob = await result.blob();
          const lastIndex = image.url.lastIndexOf('/');
          const name = image.url.substring(lastIndex + 1);
          return new File([blob], name, { type: blob.type });
        })
      )
    ).filter(isDefined);
    if (!files.length) return;
    try {
      const post = await createPostMutation.mutateAsync({});
      const pathname = `/posts/${post.id}/edit`;
      await router.push(pathname);
      postImageTransmitter.setData(files);
      generationPanel.close();
      deselect();
    } catch (e) {
      const error = e as Error;
      showErrorNotification({
        title: 'Failed to create post',
        error: new Error(error.message),
      });
    }
  };

  return {
    selected,
    deselect,
    isMutating,
    deleteSelectedImages,
    postSelectedImages,
  };
};
