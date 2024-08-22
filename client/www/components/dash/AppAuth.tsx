import { FormEventHandler, useContext, useState } from 'react';
import { errorToast } from '@/lib/toast';
import config from '@/lib/config';
import { jsonFetch } from '@/lib/fetch';
import { TokenContext } from '@/lib/contexts';
import { Loading, ErrorMessage } from '@/components/dash/shared';

import {
  InstantApp,
  AppsAuthResponse,
  AuthorizedOrigin,
  OAuthServiceProvider,
  OAuthClient,
  AuthorizedOriginService,
  InstantError,
  DashResponse,
} from '@/lib/types';
import {
  Button,
  Checkbox,
  Content,
  Copyable,
  Copytext,
  Dialog,
  Divider,
  Fence,
  Label,
  SectionHeading,
  Select,
  SubsectionHeading,
  TextInput,
  useDialog,
} from '@/components/ui';
import googleIconSvg from '../../public/google_g.svg';
import NetlifyIcon from '../icons/NetlifyIcon';
import VercelIcon from '../icons/VercelIcon';
import Image from 'next/image';
import {
  PlusIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  InformationCircleIcon,
} from '@heroicons/react/solid';
import { DeviceMobileIcon, GlobeAltIcon } from '@heroicons/react/outline';
import * as Collapsible from '@radix-ui/react-collapsible';
import {
  APIResponse,
  messageFromInstantError,
  useAuthedFetch,
} from '@/lib/auth';
import { HomeButton } from '@/pages/dash';
import { Email } from './Email';
import { useFlag } from '@/lib/hooks/useFlag';

function addAuthorizedOrigin({
  token,
  appId,
  service,
  params,
}: {
  token: string;
  appId: string;
  service: string;
  params: string[];
}): Promise<{ origin: AuthorizedOrigin }> {
  return jsonFetch(
    `${config.apiURI}/dash/apps/${appId}/authorized_redirect_origins`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ service, params }),
    }
  );
}

function removeAuthorizedOrigin({
  token,
  appId,
  originId,
}: {
  token: string;
  appId: string;
  originId: string;
}): Promise<{ origin: AuthorizedOrigin }> {
  return jsonFetch(
    `${config.apiURI}/dash/apps/${appId}/authorized_redirect_origins/${originId}`,
    {
      method: 'DELETE',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    }
  );
}

function addProvider({
  token,
  appId,
  providerName,
}: {
  token: string;
  appId: string;
  providerName: string;
}): Promise<{ provider: OAuthServiceProvider }> {
  return jsonFetch(
    `${config.apiURI}/dash/apps/${appId}/oauth_service_providers`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ provider_name: providerName }),
    }
  );
}

function addClient({
  token,
  appId,
  providerId,
  clientName,
  clientId,
  clientSecret,
  authorizationEndpoint,
  tokenEndpoint,
  discoveryEndpoint,
}: {
  token: string;
  appId: string;
  providerId: string;
  clientName: string;
  clientId: string;
  clientSecret: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  discoveryEndpoint: string;
}): Promise<{ client: OAuthClient }> {
  return jsonFetch(`${config.apiURI}/dash/apps/${appId}/oauth_clients`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      provider_id: providerId,
      client_name: clientName,
      client_id: clientId,
      client_secret: clientSecret,
      authorization_endpoint: authorizationEndpoint,
      token_endpoint: tokenEndpoint,
      discovery_endpoint: discoveryEndpoint,
    }),
  });
}

function deleteClient({
  token,
  appId,
  clientDatabaseId,
}: {
  token: string;
  appId: string;
  clientDatabaseId: string;
}): Promise<{ client: OAuthClient }> {
  return jsonFetch(
    `${config.apiURI}/dash/apps/${appId}/oauth_clients/${clientDatabaseId}`,
    {
      method: 'DELETE',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    }
  );
}

const serviceOptions: { label: string; value: AuthorizedOriginService }[] = [
  { label: 'Website', value: 'generic' },
  { label: 'Vercel previews', value: 'vercel' },
  { label: 'Netlify previews', value: 'netlify' },
  { label: 'App scheme', value: 'custom-scheme' },
];

// TODO(dww): Parse url to suggest adding a netlify or vercel project
function AuthorizedOriginsForm({
  app,
  onAddOrigin,
  onCancel,
}: {
  app: InstantApp;
  onAddOrigin: (origin: AuthorizedOrigin) => void;
  onCancel: () => void;
}) {
  const token = useContext(TokenContext);
  const [url, setUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [service, setService] = useState<AuthorizedOriginService>('generic');

  const validateUrl = (
    originParam: string,
    service: AuthorizedOriginService
  ):
    | { type: 'error'; message: string }
    | { type: 'success'; params: string[] } => {
    switch (service) {
      case 'netlify': {
        return { type: 'success', params: [originParam] };
      }
      case 'vercel': {
        return { type: 'success', params: ['vercel.app', originParam] };
      }
      case 'custom-scheme': {
        try {
          const url = new URL(originParam);
          // Remove final `:` from protocol to get scheme
          const scheme = url.protocol.slice(0, -1);
          return { type: 'success', params: [scheme] };
        } catch (e) {
          return { type: 'error', message: 'Invalid scheme.' };
        }
      }
      case 'generic':
        try {
          const url = new URL(originParam);
          const host = url.host;
          if (!host) {
            throw new Error('missing host');
          }
          // Allows localhost:port, but not just localhost
          if (host.split('.').length === 1 && !url.port) {
            throw new Error('invalid url');
          }
          return { type: 'success', params: [host] };
        } catch (e) {
          if (!originParam.startsWith('http')) {
            return validateUrl(`http://${originParam}`, service);
          }
          return { type: 'error', message: 'Invalid URL.' };
        }
      default: {
        return { type: 'error', message: 'Unknown type' };
      }
    }
  };
  const onSubmit: FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const validated = validateUrl(url, service);
      if (validated.type === 'error') {
        errorToast(validated.message, { autoClose: 5000 });
        return;
      }
      const resp = await addAuthorizedOrigin({
        token,
        appId: app.id,
        service: service,
        params: validated.params,
      });
      onAddOrigin(resp.origin);
    } catch (e) {
      console.error(e);
      const msg =
        messageFromInstantError(e as InstantError) || 'Error creating origin.';
      errorToast(msg, { autoClose: 5000 });
    } finally {
      setIsLoading(false);
    }
  };
  const TypeHelp = ({ text }: { text: string }) => {
    return (
      <Content className="flex flex-row items-center gap-1 text-sm">
        <span>
          <InformationCircleIcon className="" height="1em" />
        </span>
        <span>{text}</span>
      </Content>
    );
  };
  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 border rounded p-4"
    >
      <div className="flex flex-row gap-2">
        <div className="flex flex-col gap-1">
          <Label>Type</Label>
          <Select
            options={serviceOptions}
            onChange={(v) => {
              if (v) {
                setService(v.value as AuthorizedOriginService);
              }
            }}
            value={service}
          />
        </div>
        <div className="flex-grow">
          <TextInput
            value={url}
            onChange={setUrl}
            label={originInputLabel(service)}
            placeholder={originInputPlaceholder(service)}
          />
        </div>
      </div>
      {service === 'vercel' ? (
        <TypeHelp text="Vercel preview origins will allow all preview urls for the project." />
      ) : null}
      {service === 'netlify' ? (
        <TypeHelp text="Netlify preview origins will allow all preview urls for the site." />
      ) : null}
      {service === 'custom-scheme' ? (
        <TypeHelp text="Use app scheme if you're implementing the OAuth flow in a native app." />
      ) : null}
      <div className="flex flex-row gap-2">
        <Button loading={isLoading} variant="primary" type="submit">
          Add
        </Button>
        <Button variant="secondary" onClick={() => onCancel()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function AddClientForm({
  app,
  provider,
  onAddClient,
  onCancel,
}: {
  app: InstantApp;
  provider: OAuthServiceProvider;
  onAddClient: (client: OAuthClient) => void;
  onCancel: () => void;
}) {
  const token = useContext(TokenContext);
  const [clientName, setClientName] = useState<string>('');
  const [clientId, setClientId] = useState<string>('');
  const [clientSecret, setClientSecret] = useState<string>('');
  const [updatedRedirectURL, setUpdatedRedirectURL] = useState(false);

  // We're going to assume Google only for now
  const [authorizationEndpoint, setAuthorizationEndpoint] = useState<string>(
    'https://accounts.google.com/o/oauth2/v2/auth'
  );

  // We're going to assume Google only for now
  const [tokenEndpoint, setTokenEndpoint] = useState<string>(
    'https://oauth2.googleapis.com/token'
  );

  // We're going to assume Google only for now
  const [discoveryEndpoint, setDiscoveryEndpoint] = useState<string>(
    'https://accounts.google.com/.well-known/openid-configuration'
  );

  const [isLoading, setIsLoading] = useState<boolean>(false);

  const validationError = () => {
    if (!clientName) {
      return 'Missing unique name';
    }
    if (!clientId) {
      return 'Missing client id';
    }
    if (!clientSecret) {
      return 'Missing client secret';
    }
  };

  const onSubmit: FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    const err = validationError();
    if (err) {
      errorToast(err, { autoClose: 5000 });
      return;
    }
    try {
      setIsLoading(true);
      const resp = await addClient({
        token,
        appId: app.id,
        providerId: provider.id,
        clientName,
        clientId,
        clientSecret,
        authorizationEndpoint,
        tokenEndpoint,
        discoveryEndpoint,
      });
      onAddClient(resp.client);
    } catch (e) {
      console.error(e);
      const msg =
        messageFromInstantError(e as InstantError) || 'Error creating client.';
      errorToast(msg, { autoClose: 5000 });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-2 p-4 rounded border"
      onSubmit={onSubmit}
      autoComplete="off"
      data-lpignore="true"
    >
      <SubsectionHeading>Add a new Google client</SubsectionHeading>
      <TextInput
        tabIndex={1}
        value={clientName}
        onChange={setClientName}
        label="Unique name"
        placeholder="e.g. google-web"
      />
      <TextInput
        tabIndex={2}
        value={clientId}
        onChange={setClientId}
        label={
          <>
            Client ID from{' '}
            <a
              className="underline"
              target="_blank"
              rel="noopener noreferer"
              href="https://console.developers.google.com/apis/credentials"
            >
              Google console
            </a>
          </>
        }
        placeholder=""
      />
      <TextInput
        type="sensitive"
        tabIndex={3}
        value={clientSecret}
        onChange={setClientSecret}
        label={
          <>
            Client secret from{' '}
            <a
              className="underline"
              target="_blank"
              rel="noopener noreferer"
              href="https://console.developers.google.com/apis/credentials"
            >
              Google console
            </a>
          </>
        }
      />
      <div className="rounded border p-4 flex flex-col gap-2 bg-gray-50">
        <p className="overflow-hidden">
          Add{' '}
          <Copytext value="https://api.instantdb.com/runtime/oauth/callback" />{' '}
          to the "Authorized redirect URIs" on your{' '}
          <a
            className="underline"
            target="_blank"
            rel="noopener noreferer"
            href={
              clientId
                ? `https://console.cloud.google.com/apis/credentials/oauthclient/${clientId}`
                : 'https://console.developers.google.com/apis/credentials'
            }
          >
            Google OAuth client
          </a>
          .
        </p>
        <Checkbox
          checked={updatedRedirectURL}
          onChange={setUpdatedRedirectURL}
          label="I added the redirect to Google"
        />
      </div>
      <Button loading={isLoading} type="submit">
        Add client
      </Button>
      <Button variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

function AddGoogleClientForm({
  app,
  onAddProvider,
}: {
  app: InstantApp;
  onAddProvider: (provider: OAuthServiceProvider) => void;
}) {
  const token = useContext(TokenContext);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const addGoogleProvider = async () => {
    setIsLoading(true);
    try {
      const resp = await addProvider({
        token,
        appId: app.id,
        providerName: 'google',
      });
      onAddProvider(resp.provider);
    } catch (e) {
      console.error(e);
      const msg =
        messageFromInstantError(e as InstantError) ||
        'There was an error setting up Google.';
      errorToast(msg, { autoClose: 5000 });
      // report error
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <div>
      <Button
        loading={isLoading}
        variant="secondary"
        onClick={addGoogleProvider}
      >
        <span className="flex items-center space-x-2">
          <Image src={googleIconSvg} />
          <span>Setup Google</span>
        </span>
      </Button>
    </div>
  );
}

function Client({
  app,
  client,
  onDeleteClient,
  defaultOpen = false,
}: {
  app: InstantApp;
  client: OAuthClient;
  onDeleteClient: (client: OAuthClient) => void;
  defaultOpen?: boolean;
}) {
  const token = useContext(TokenContext);
  const [open, setOpen] = useState(defaultOpen);
  const [isLoading, setIsLoading] = useState(false);
  const deleteDialog = useDialog();

  const handleDelete = async () => {
    try {
      setIsLoading(true);
      const resp = await deleteClient({
        token,
        appId: app.id,
        clientDatabaseId: client.id,
      });
      onDeleteClient(resp.client);
      deleteDialog.onClose();
    } catch (e) {
      console.error(e);
      const msg =
        messageFromInstantError(e as InstantError) || 'Error deleting client.';
      errorToast(msg, { autoClose: 5000 });
    } finally {
      setIsLoading(false);
    }
  };

  const exampleCode = `// create the authorization URL:
const url = db.auth.createAuthorizationURL({
  clientName: "${client.client_name}",
  redirectURL: window.location.href,
});

// Create a link with the url
<a href={url}>Log in with Google</a>`;

  return (
    <div className="">
      <Collapsible.Root
        open={open}
        onOpenChange={setOpen}
        className="flex flex-col border rounded"
      >
        <Collapsible.Trigger className="flex p-4 hover:bg-gray-100 bg-gray-50">
          <div className="flex flex-1 justify-between items-center">
            <div className="flex gap-2">
              {' '}
              <Image src={googleIconSvg} />
              <SectionHeading>
                {client.client_name}{' '}
                <span className="text-gray-400">(Google)</span>
              </SectionHeading>
            </div>
            {open ? (
              <ChevronDownIcon height={24} />
            ) : (
              <ChevronUpIcon height={24} />
            )}
          </div>
        </Collapsible.Trigger>
        <Collapsible.Content className="">
          <div className="p-4 flex flex-col gap-4 border-t">
            <Copyable label="Google client ID" value={client.client_id} />
            <Copyable label="Client name" value={client.client_name} />
            <SubsectionHeading>Setup and usage</SubsectionHeading>
            <Content>
              <strong>1.</strong> Navigate to{' '}
              <a
                className="underline"
                href={`https://console.cloud.google.com/apis/credentials/oauthclient/${client.client_id}`}
                target="_blank"
                rel="noopener noreferer"
              >
                Google OAuth client
              </a>{' '}
              and add Instant's redirect URL under "Authorized redirect URIs
            </Content>
            <Copyable
              label="Redirect URI"
              value="https://api.instantdb.com/runtime/oauth/callback"
            />
            <Content>
              <strong>2.</strong> Use the code below to generate a login link in
              your app.
            </Content>

            <div className="border rounded p-4 text-sm overflow-auto">
              <Fence code={exampleCode} language="typescript" />
            </div>

            <Divider />

            <div>
              <Button
                onClick={deleteDialog.onOpen}
                loading={isLoading}
                variant="destructive"
              >
                Delete client
              </Button>
            </div>
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
      <Dialog {...deleteDialog}>
        <div className="flex flex-col gap-2">
          <SubsectionHeading>Delete client</SubsectionHeading>
          <Content>
            Deleting the client will prevent users from using this client to log
            in to your app. Be sure that you've removed any reference to it in
            your code before deleting.
          </Content>
          <Button
            loading={isLoading}
            variant="destructive"
            onClick={handleDelete}
          >
            Delete
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

// We should eventually have a generic component for any provider,
// but we'll start with just Google for now to keep things simple
function GoogleClients({
  app,
  provider,
  clients,
  onAddClient,
  onDeleteClient,
}: {
  app: InstantApp;
  provider: OAuthServiceProvider;
  clients: OAuthClient[];
  onAddClient: (client: OAuthClient) => void;
  onDeleteClient: (client: OAuthClient) => void;
}) {
  const needsFirstClient = clients.length === 0;
  const [showAddClientForm, setShowAddClientForm] =
    useState<boolean>(needsFirstClient);

  const handleAddClient = (client: OAuthClient) => {
    setShowAddClientForm(false);
    onAddClient(client);
  };

  return (
    <div className="flex flex-col gap-2">
      {showAddClientForm ? (
        <>
          <AddClientForm
            app={app}
            provider={provider}
            onAddClient={handleAddClient}
            onCancel={() => setShowAddClientForm(false)}
          />
        </>
      ) : (
        <Button onClick={() => setShowAddClientForm(true)} variant="secondary">
          <PlusIcon height={14} /> Add a new Google client
        </Button>
      )}
      {clients.map((c) => {
        return (
          <Client
            key={c.id}
            app={app}
            client={c}
            onDeleteClient={onDeleteClient}
            defaultOpen={clients.length === 1}
          />
        );
      })}
    </div>
  );
}

function originDisplay(origin: AuthorizedOrigin) {
  switch (origin.service) {
    case 'generic':
      return origin.params[0];
    case 'netlify':
      return origin.params[0];
    case 'vercel':
      return origin.params[1];
    case 'custom-scheme':
      return `${origin.params[0]}://`;
    default:
      return origin.params[0];
  }
}

function originIcon(origin: AuthorizedOrigin) {
  switch (origin.service) {
    case 'generic':
      return GlobeAltIcon;
    case 'netlify':
      return NetlifyIcon;
    case 'vercel':
      return VercelIcon;
    case 'custom-scheme':
      return DeviceMobileIcon;
    default:
      return GlobeAltIcon;
  }
}

function originSource(origin: AuthorizedOrigin) {
  switch (origin.service) {
    case 'generic':
      return 'Website';
    case 'netlify':
      return 'Netlify site';
    case 'vercel':
      if (origin.params[0] !== 'vercel.app') {
        return `Vercel project (${origin.params[0]})`;
      }
      return 'Vercel project';
    case 'custom-scheme':
      return 'Native app';
    default:
      return '';
  }
}

function originInputLabel(service: AuthorizedOriginService) {
  switch (service) {
    case 'generic':
      return 'Origin';
    case 'netlify':
      return 'Netlify site';
    case 'vercel':
      return 'Vercel project';
    case 'custom-scheme':
      return 'App scheme';
    default:
      return '';
  }
}

function originInputPlaceholder(service: AuthorizedOriginService) {
  switch (service) {
    case 'generic':
      return 'https://example.com';
    case 'netlify':
      return 'netlify-site-name';
    case 'vercel':
      return 'vercel-project-name';
    case 'custom-scheme':
      return 'app-scheme://';
    default:
      return '';
  }
}

function AuthorizedOriginRow({
  app,
  origin,
  onRemoveOrigin,
}: {
  app: InstantApp;
  origin: AuthorizedOrigin;
  onRemoveOrigin: (origin: AuthorizedOrigin) => void;
}) {
  const token = useContext(TokenContext);
  const deleteDialog = useDialog();
  const [isLoading, setIsLoading] = useState(false);
  const handleRemoveOrigin = async () => {
    try {
      setIsLoading(true);
      const resp = await removeAuthorizedOrigin({
        token,
        appId: app.id,
        originId: origin.id,
      });
      deleteDialog.onClose();
      onRemoveOrigin(resp.origin);
    } catch (e) {
      console.error(e);
      const msg =
        messageFromInstantError(e as InstantError) || 'Error removing origin.';
      errorToast(msg, { autoClose: 5000 });
    } finally {
      setIsLoading(false);
    }
  };

  const Icon = originIcon(origin);

  return (
    <div className="flex items-center justify-between rounded border p-4 bg-gray-50">
      <div className="flex items-center gap-4">
        <Icon height="1.5em" />
        <div className="flex flex-col leading-4">
          <span className="text-xs font-light text-gray-500">
            {originSource(origin)}
          </span>
          <span className="font-medium text-gray-700">
            {originDisplay(origin)}
          </span>
        </div>
      </div>
      <button onClick={deleteDialog.onOpen}>
        <TrashIcon height={'1rem'} className="" />
      </button>
      <Dialog {...deleteDialog}>
        <div className="flex flex-col gap-2">
          <SubsectionHeading>Delete {originDisplay(origin)}</SubsectionHeading>
          <Content>
            Deleting the origin will prevent users from using logging in to your
            app with an OAuth service from this origin.
          </Content>
          <Button
            loading={isLoading}
            variant="destructive"
            onClick={handleRemoveOrigin}
          >
            Delete
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function AuthorizedOrigins({
  app,
  origins,
  onAddOrigin,
  onRemoveOrigin,
}: {
  app: InstantApp;
  origins: AuthorizedOrigin[];
  onAddOrigin: (origin: AuthorizedOrigin) => void;
  onRemoveOrigin: (origin: AuthorizedOrigin) => void;
}) {
  const [showAddOriginForm, setShowAddOriginForm] = useState(
    origins.length === 0
  );
  return (
    <div className="flex gap-2 flex-col">
      <div>
        <SectionHeading>Redirect Origins </SectionHeading>
        <Content className="text-gray-500 text-sm">
          Add your site's url so that you can initiate the OAuth flow from your
          site.
        </Content>
      </div>

      {showAddOriginForm ? null : (
        <Button onClick={() => setShowAddOriginForm(true)} variant="secondary">
          <PlusIcon height={14} /> Add an origin
        </Button>
      )}

      {showAddOriginForm ? (
        <>
          <AuthorizedOriginsForm
            app={app}
            onAddOrigin={(origin) => {
              setShowAddOriginForm(false);
              onAddOrigin(origin);
            }}
            onCancel={() => setShowAddOriginForm(false)}
          />
        </>
      ) : null}

      <>
        {origins.map((o) => {
          return (
            <AuthorizedOriginRow
              key={o.id}
              app={app}
              origin={o}
              onRemoveOrigin={onRemoveOrigin}
            />
          );
        })}
      </>
    </div>
  );
}

export function AppAuth({
  app,
  dashResponse,
  nav,
}: {
  app: InstantApp;
  dashResponse: APIResponse<DashResponse>;
  nav: (p: { s: string; t?: string; app?: string }) => void;
}) {
  const authResponse = useAuthedFetch<AppsAuthResponse>(
    `${config.apiURI}/dash/apps/${app.id}/auth`
  );

  if (authResponse.isLoading) {
    return <Loading />;
  }

  const data = authResponse.data;

  if (!data) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 p-2">
        <ErrorMessage>
          <div className="flex gap-2">
            There was an error loading the data.{' '}
            <Button
              variant="subtle"
              size="mini"
              onClick={() =>
                authResponse.mutate(undefined, { revalidate: true })
              }
            >
              Refresh.
            </Button>
          </div>
        </ErrorMessage>
      </div>
    );
  }

  const handleAddOrigin = (origin: AuthorizedOrigin) => {
    authResponse.mutate({
      ...data,
      authorized_redirect_origins: [
        origin,
        ...(data.authorized_redirect_origins || []),
      ],
    });
  };

  const handleRemoveOrigin = (origin: AuthorizedOrigin) => {
    authResponse.mutate({
      ...data,
      authorized_redirect_origins: data.authorized_redirect_origins?.filter(
        (o) => o.id !== origin.id
      ),
    });
  };

  const handleAddProvider = (provider: OAuthServiceProvider) => {
    authResponse.mutate({
      ...data,
      oauth_service_providers: [
        provider,
        ...(data.oauth_service_providers || []),
      ],
    });
  };

  const handleAddClient = (client: OAuthClient) => {
    authResponse.mutate({
      ...data,
      oauth_clients: [client, ...(data.oauth_clients || [])],
    });
  };

  const handleDeleteClient = (client: OAuthClient) => {
    authResponse.mutate({
      ...data,
      oauth_clients: (data.oauth_clients || []).filter(
        (c) => c.id !== client.id
      ),
    });
  };

  const googleProvider = data.oauth_service_providers?.find(
    (p) => p.provider_name === 'google'
  );

  return (
    <div className="flex flex-col p-4 gap-6 max-w-xl">
      <div className="flex flex-col gap-4">
        <SectionHeading>Auth Providers</SectionHeading>
        <HomeButton
          href="/docs/auth#log-in-with-google"
          title="Logging in with Google"
        >
          Learn how to add Google OAuth to your app.
        </HomeButton>
        <Content>
          Add an OAuth provider to allow users to log in to your app. We
          currently only support Google, but more providers are coming soon.
        </Content>
        {googleProvider ? (
          <GoogleClients
            app={app}
            provider={googleProvider}
            clients={
              data.oauth_clients?.filter(
                (c) => c.provider_id === googleProvider.id
              ) || []
            }
            onAddClient={handleAddClient}
            onDeleteClient={handleDeleteClient}
          />
        ) : (
          <AddGoogleClientForm app={app} onAddProvider={handleAddProvider} />
        )}
      </div>

      {googleProvider && data.oauth_clients?.length ? (
        <>
          <Divider />
          <AuthorizedOrigins
            app={app}
            origins={data.authorized_redirect_origins || []}
            onAddOrigin={handleAddOrigin}
            onRemoveOrigin={handleRemoveOrigin}
          />
        </>
      ) : null}
      <Divider />
      <Email app={app} dashResponse={dashResponse} nav={nav} />
    </div>
  );
}