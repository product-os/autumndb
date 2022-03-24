import type { Contract, ContractDefinition } from './contract';

export type ListOfEmailAddresses = string[];
export type SingleEmailAddress = string;
export type Avatar = string | null;
export type City = string;
export type LastName = string;
export type FirstName = string;
export type Pronouns = string;
export type PreferredName = string;
export type AboutMe = string;
export type AskMeAbout = string[];
export type Links = string[];
export type Country = string;
export type Birthday = string;
export type Timezone = string;
export type StartedAtTheCompany = string;
/**
 * Command to send a message
 */
export type SendCommand = 'shift+enter' | 'ctrl+enter' | 'enter';
/**
 * Do not play a sound when displaying notifications
 */
export type DisableNotificationSound = boolean;

export interface UserData {
	hash: string;
	email?: ListOfEmailAddresses | SingleEmailAddress;
	/**
	 * Linked accounts
	 */
	oauth?: {
		[k: string]: unknown;
	};
	roles: string[];
	avatar?: Avatar;
	status?:
		| {
				title?: 'Do Not Disturb';
				value?: 'DoNotDisturb';
				[k: string]: unknown;
		  }
		| {
				title?: 'On Annual Leave';
				value?: 'AnnualLeave';
				[k: string]: unknown;
		  }
		| {
				title?: 'In a Meeting';
				value?: 'Meeting';
				[k: string]: unknown;
		  }
		| {
				title?: 'Available';
				value?: 'Available';
				[k: string]: unknown;
		  };
	/**
	 * Configuration options for your account
	 */
	profile?: {
		city?: City;
		name?: {
			last?: LastName;
			first?: FirstName;
			pronouns?: Pronouns;
			preffered?: PreferredName;
			[k: string]: unknown;
		};
		type?: string;
		about?: {
			aboutMe?: AboutMe;
			askMeAbout?: AskMeAbout;
			externalLinks?: Links;
			[k: string]: unknown;
		};
		title?: string;
		company?: string;
		country?: Country;
		birthday?: Birthday;
		/**
		 * The default view that is loaded after you login
		 */
		homeView?: string;
		timezone?: Timezone;
		startDate?: StartedAtTheCompany;
		sendCommand?: SendCommand;
		/**
		 * List of view slugs that are starred
		 */
		starredViews?: string[];
		/**
		 * A map of settings for view cards, keyed by the view id
		 */
		viewSettings?: {
			/**
			 * This interface was referenced by `undefined`'s JSON-Schema definition
			 * via the `patternProperty` "^.*$".
			 */
			[k: string]: {
				[k: string]: unknown;
			};
		};
		disableNotificationSound?: DisableNotificationSound;
		[k: string]: unknown;
	};
	[k: string]: unknown;
}

export interface UserContractDefinition extends ContractDefinition<UserData> {}

export interface UserContract extends Contract<UserData> {}
