import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  HoverCard,
  Stack,
  Text,
  ThemeIcon,
  MantineColor,
  Tooltip,
  SimpleGrid,
} from '@mantine/core';
import { IconBolt, IconPhoto, IconX } from '@tabler/icons-react';

import { Collection } from '~/components/Collection/Collection';
import { ContentClamp } from '~/components/ContentClamp/ContentClamp';
import { Countdown } from '~/components/Countdown/Countdown';
import { DaysFromNow } from '~/components/Dates/DaysFromNow';
import { openBoostModal, useBoostModalStore } from '~/components/ImageGeneration/BoostModal';
import { GeneratedImage } from '~/components/ImageGeneration/GeneratedImage';
import { GenerationDetails } from '~/components/ImageGeneration/GenerationDetails';
import {
  useImageGenerationRequest,
  useImageGenerationStore,
} from '~/components/ImageGeneration/hooks/useImageGenerationState';
import { Generation, GenerationRequestStatus } from '~/server/services/generation/generation.types';
import { formatDateMin } from '~/utils/date-helpers';
import { trpc } from '~/utils/trpc';

const statusColors: Record<GenerationRequestStatus, MantineColor> = {
  [GenerationRequestStatus.Pending]: 'gray',
  [GenerationRequestStatus.Cancelled]: 'gray',
  [GenerationRequestStatus.Processing]: 'yellow',
  [GenerationRequestStatus.Succeeded]: 'green',
  [GenerationRequestStatus.Error]: 'red',
};

export function QueueItem({ id }: Props) {
  const showBoost = useBoostModalStore((state) => state.showBoost);

  const request = useImageGenerationRequest(id);
  const removeRequest = useImageGenerationStore((state) => state.removeRequest);
  const deleteMutation = trpc.generation.deleteRequest.useMutation({
    onSuccess: (response, request) => {
      removeRequest(request.id);
    },
    onError: (err) => {
      console.log({ err });
    },
  });

  const { prompt, ...details } = request.params;

  const status = request.status ?? GenerationRequestStatus.Pending;
  const pendingProcessing =
    status === GenerationRequestStatus.Pending || status === GenerationRequestStatus.Processing;
  const succeeded = status === GenerationRequestStatus.Succeeded;
  const failed = status === GenerationRequestStatus.Error;

  const boost = (request: Generation.Request) => {
    console.log('boost it', request);
  };

  // TODO - enable this after boosting is ready
  const handleBoostClick = () => {
    if (showBoost) openBoostModal({ request, cb: boost });
    else boost(request);
  };

  return (
    <Card withBorder px="xs">
      <Card.Section py={4} inheritPadding withBorder>
        <Group position="apart">
          <Group spacing={8}>
            {!!request.images?.length && (
              <Tooltip label={status} withArrow color="dark">
                <ThemeIcon
                  variant={pendingProcessing ? 'filled' : 'light'}
                  w="auto"
                  h="auto"
                  size="sm"
                  color={statusColors[status]}
                  px={4}
                  py={2}
                  sx={{ cursor: 'default' }}
                >
                  <Group spacing={4}>
                    <IconPhoto size={16} />
                    <Text size="sm" inline weight={500}>
                      {request.images.length}
                    </Text>
                  </Group>
                </ThemeIcon>
              </Tooltip>
            )}
            {pendingProcessing && (
              <Button.Group>
                <Button
                  size="xs"
                  variant="outline"
                  color="gray"
                  sx={{ pointerEvents: 'none' }}
                  compact
                >
                  ETA <Countdown endTime={request.estimatedCompletionDate} />
                </Button>
                <HoverCard withArrow position="top" withinPortal zIndex={400}>
                  <HoverCard.Target>
                    <Button
                      size="xs"
                      rightIcon={showBoost ? <IconBolt size={16} /> : undefined}
                      compact
                      // onClick={handleBoostClick}
                    >
                      Boost
                    </Button>
                  </HoverCard.Target>
                  <HoverCard.Dropdown title="Coming soon" maw={300}>
                    <Stack spacing={0}>
                      <Text weight={500}>Coming soon!</Text>
                      <Text size="xs">
                        Want to run this request faster? Boost it to the front of the queue.
                      </Text>
                    </Stack>
                  </HoverCard.Dropdown>
                </HoverCard>
              </Button.Group>
            )}
            <Text size="xs" color="dimmed">
              {formatDateMin(request.createdAt)}
            </Text>
          </Group>
          <ActionIcon
            color="red"
            size="md"
            onClick={() => deleteMutation.mutate({ id })}
            disabled={deleteMutation.isLoading}
          >
            <IconX size={20} />
          </ActionIcon>
        </Group>
      </Card.Section>
      <Stack py="xs" spacing={8}>
        <ContentClamp maxHeight={36} labelSize="xs">
          <Text lh={1.3}>{prompt}</Text>
        </ContentClamp>
        <Collection
          items={request.resources}
          limit={3}
          renderItem={(resource: any) => (
            <Badge size="sm">
              {resource.modelName} - {resource.name}
            </Badge>
          )}
          grouped
        />
        {!failed && !!request.images?.length && (
          <SimpleGrid
            spacing="xs"
            breakpoints={[
              { maxWidth: 'sm', cols: 2 },
              { minWidth: 'sm', cols: 4 },
            ]}
          >
            {request.images.map((image) => (
              <GeneratedImage
                key={image.id}
                height={request.params.height}
                width={request.params.width}
                image={image}
              />
            ))}
          </SimpleGrid>
        )}
      </Stack>
      <Card.Section
        withBorder
        sx={(theme) => ({
          marginLeft: -theme.spacing.xs,
          marginRight: -theme.spacing.xs,
        })}
      >
        <GenerationDetails
          label="Additional Details"
          params={details}
          labelWidth={150}
          paperProps={{ radius: 0, sx: { borderWidth: '1px 0 0 0' } }}
        />
      </Card.Section>
      {/* <Card.Section py="xs" inheritPadding>
        <Group position="apart" spacing={8}>
          <Text color="dimmed" size="xs">
            Fulfillment by {item.provider.name}
          </Text>
          <Text color="dimmed" size="xs">
            Started <DaysFromNow date={item.createdAt} />
          </Text>
        </Group>
      </Card.Section> */}
    </Card>
  );
}

type Props = {
  // item: Generation.Request;
  id: number;
};